import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { haversineKm } from "../../common/geo.util";
import { db } from "../../db";
import { channelPartners, partnerSchemeQuotas, schemes } from "../../db/schema";
import type { CitizenProfile } from "./scheme-matching.schema";
import { categoriesForIntent } from "./scheme-matching.scoring";
import type { PartnerAvailability } from "./scheme-matching.scoring";

/**
 * Hard eligibility filters, pushed into Postgres.
 *
 * Everything here is a rule that makes a scheme legally or structurally
 * unusable for this citizen. Anything that is merely a matter of degree
 * (how well the amount fits, how close a partner is) is left to the
 * deterministic ranker instead of being filtered away here.
 */
export const findCandidateSchemes = async (profile: CitizenProfile) => {
  const conditions = [
    eq(schemes.isActive, true),
    inArray(schemes.category, categoriesForIntent(profile.intent)),
    gte(schemes.maxAnnualFamilyIncome, profile.annualFamilyIncome.toString()),
    or(isNull(schemes.minAge), lte(schemes.minAge, profile.age)),
    or(isNull(schemes.maxAge), gte(schemes.maxAge, profile.age)),
  ];

  if (profile.gender !== "female") {
    conditions.push(eq(schemes.genderEligibility, "all"));
  }

  // NSFDC credit lines are reserved for Scheduled Caste applicants; a
  // non-SC citizen can only see schemes that don't carry that clause.
  if (!profile.isScheduledCaste) {
    conditions.push(
      sql`coalesce((${schemes.eligibilityRules} ->> 'requiresScheduledCaste')::boolean, false) = false`,
    );
  }

  // A scheme's floor is a real floor — you cannot borrow ₹50k under a
  // term loan that starts at ₹1.25L — so this one is a hard filter.
  if (profile.requiredLoanAmount !== undefined) {
    conditions.push(
      lte(schemes.minLoanAmount, profile.requiredLoanAmount.toString()),
    );
  }

  return db.query.schemes.findMany({
    where: and(...conditions),
    with: { interestSlabs: true },
    orderBy: (scheme, { asc }) => [asc(scheme.code)],
  });
};

export type CandidateScheme = Awaited<
  ReturnType<typeof findCandidateSchemes>
>[number];

/**
 * Per-scheme channel-partner availability, used by the ranker's
 * locationFit signal. Distance is computed in JS with the same
 * haversine helper the partner locator uses, so the two modules can
 * never report different distances for the same pair of points.
 */
export const findPartnerAvailability = async (
  schemeIds: string[],
  citizenLat?: number,
  citizenLng?: number,
): Promise<Map<string, PartnerAvailability>> => {
  const availability = new Map<string, PartnerAvailability>(
    schemeIds.map((id) => [
      id,
      { nearestKm: null, hasServiceablePartner: false },
    ]),
  );

  if (schemeIds.length === 0) return availability;

  const rows = await db
    .select({
      schemeId: partnerSchemeQuotas.schemeId,
      latitude: channelPartners.latitude,
      longitude: channelPartners.longitude,
    })
    .from(partnerSchemeQuotas)
    .innerJoin(
      channelPartners,
      eq(channelPartners.id, partnerSchemeQuotas.partnerId),
    )
    .where(
      and(
        inArray(partnerSchemeQuotas.schemeId, schemeIds),
        eq(channelPartners.status, "active"),
        eq(partnerSchemeQuotas.acceptingApplications, true),
        sql`${partnerSchemeQuotas.utilizedAmount} < ${partnerSchemeQuotas.totalQuotaAmount}`,
      ),
    );

  const hasGeo = citizenLat !== undefined && citizenLng !== undefined;

  for (const row of rows) {
    const current = availability.get(row.schemeId);
    if (!current) continue;
    current.hasServiceablePartner = true;

    if (!hasGeo) continue;
    const distanceKm = haversineKm(
      citizenLat,
      citizenLng,
      Number(row.latitude),
      Number(row.longitude),
    );
    if (current.nearestKm === null || distanceKm < current.nearestKm) {
      current.nearestKm = distanceKm;
    }
  }

  return availability;
};

const inr = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;

/**
 * Works out WHICH hard filter emptied the candidate list.
 *
 * Runs only on the zero-match path, and only once: it pulls the (small)
 * set of active schemes for the intent and re-applies each filter in
 * turn in JS, reporting the first one that drops the count to zero.
 * Without this a 404 says "nothing matched" and the operator has no way
 * to tell a genuinely ineligible citizen from a mis-sent payload.
 */
export const diagnoseNoMatch = async (profile: CitizenProfile) => {
  const rows = await db.query.schemes.findMany({
    where: and(
      eq(schemes.isActive, true),
      inArray(schemes.category, categoriesForIntent(profile.intent)),
    ),
  });

  if (rows.length === 0) {
    return {
      blockingFilter: "intent",
      explanation: `No active schemes are currently loaded for ${profile.intent}.`,
    };
  }

  type Row = (typeof rows)[number];
  const checks: Array<{
    filter: string;
    passes: (scheme: Row) => boolean;
    explain: (surviving: Row[]) => string;
  }> = [
    {
      filter: "annualFamilyIncome",
      passes: (s) =>
        Number(s.maxAnnualFamilyIncome) >= profile.annualFamilyIncome,
      explain: (surviving) =>
        `Annual family income of ${inr(profile.annualFamilyIncome)} is above the income ceiling of every remaining scheme (the highest is ${inr(
          Math.max(...surviving.map((s) => Number(s.maxAnnualFamilyIncome))),
        )}).`,
    },
    {
      filter: "age",
      passes: (s) =>
        (s.minAge === null || s.minAge <= profile.age) &&
        (s.maxAge === null || s.maxAge >= profile.age),
      explain: () => `Age ${profile.age} falls outside every scheme's age band.`,
    },
    {
      filter: "gender",
      passes: (s) =>
        profile.gender === "female" || s.genderEligibility === "all",
      explain: () =>
        "Every remaining scheme for this intent is reserved for women applicants.",
    },
    {
      filter: "isScheduledCaste",
      passes: (s) =>
        profile.isScheduledCaste ||
        s.eligibilityRules?.requiresScheduledCaste !== true,
      explain: () =>
        "Every remaining scheme requires the applicant to belong to a Scheduled Caste.",
    },
    {
      filter: "requiredLoanAmount",
      passes: (s) =>
        profile.requiredLoanAmount === undefined ||
        Number(s.minLoanAmount) <= profile.requiredLoanAmount,
      explain: (surviving) =>
        `The requested amount of ${inr(profile.requiredLoanAmount ?? 0)} is below the minimum loan size of every remaining scheme (the smallest is ${inr(
          Math.min(...surviving.map((s) => Number(s.minLoanAmount))),
        )}).`,
    },
  ];

  let surviving = rows;
  for (const check of checks) {
    const next = surviving.filter(check.passes);
    if (next.length === 0) {
      return {
        blockingFilter: check.filter,
        explanation: check.explain(surviving),
      };
    }
    surviving = next;
  }

  return { blockingFilter: null, explanation: null };
};
