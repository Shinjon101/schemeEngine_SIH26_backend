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
