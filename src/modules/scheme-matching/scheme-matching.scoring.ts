import type { schemes } from "../../db/schema";
import type { CitizenProfile, Intent } from "./scheme-matching.schema";

/**
 * Deterministic scheme ranking.
 *
 * Nothing in this file calls an LLM. Given the same profile and the
 * same candidate rows it returns byte-identical scores, ordering and
 * reasoning on every run — which is the property a citizen-facing
 * entitlement decision needs. The LLM's remaining job is explaining a
 * ranking it did not produce (see scheme-summary.service.ts).
 *
 * Two layers come out of here:
 *  - `signals`, every raw sub-signal normalised to 0-1, for debugging
 *    and for callers that want to see the machinery;
 *  - `scoreBreakdown`, those signals converted into the fixed point
 *    budget the recommendation card renders, which sums to exactly the
 *    0-100 match score.
 */

/** Raw signals, each normalised to 0-1. */
export interface SchemeSignals {
  intent: number;
  loanAmount: number;
  affordability: number;
  projectCost: number;
  occupation: number;
  income: number;
  education: number;
  location: number;
}

/** Points awarded per signal. Sums to 100 — this is the match score. */
export interface ScoreBreakdown {
  intentFit: number;
  loanAmountFit: number;
  projectCostFit: number;
  occupationFit: number;
  incomeFit: number;
  educationFit: number;
  locationFit: number;
}

const POINTS = {
  intentFit: 20,
  loanAmountFit: 20,
  projectCostFit: 15,
  occupationFit: 15,
  incomeFit: 10,
  educationFit: 7,
  locationFit: 8,
} as const;

// Within the 20 "loan fit" points, how much the scheme's lending band
// matters versus what the money costs the borrower. Both are about
// whether this is the right loan to take, so they share one budget.
const LOAN_BAND_SHARE = 0.6;
const AFFORDABILITY_SHARE = 0.4;

/** Score used when a signal is simply unknown — deliberately mid-band so
 *  a missing optional field neither rewards nor punishes a scheme. */
const UNKNOWN = 0.5;
const MAX_CONSIDERED_RADIUS_KM = 100;
const NO_PARTNER_PENALTY = 0.2;

// The concessional band the problem statement describes: NSFDC-routed
// credit runs from 6.5% at the cheapest to 15% at the NBFC-MFI end.
const BEST_RATE_PERCENT = 6.5;
const WORST_RATE_PERCENT = 15;

export const MAX_RECOMMENDATIONS = 3;

// Taken straight off the table rather than off the repository's
// inferred row type — the repository asks this module which categories
// to query, so deriving these from it would be circular.
export type RankableScheme = typeof schemes.$inferSelect;
type SchemeCategory = RankableScheme["category"];
type TargetPersona = RankableScheme["targetPersona"];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

// Which scheme categories can serve an intent at all, and how squarely.
// The repository uses the keys of this table as its category filter, so
// a category absent here is never even a candidate.
export const INTENT_CATEGORY_AFFINITY: Record<
  Intent,
  Partial<Record<SchemeCategory, number>>
> = {
  business_loan: { micro_finance: 1, term_loan: 1, women_focused: 0.9 },
  education_loan: { education_loan: 1 },
  skill_training: { skill_training: 1 },
};

export const categoriesForIntent = (intent: Intent): SchemeCategory[] =>
  Object.keys(INTENT_CATEGORY_AFFINITY[intent]) as SchemeCategory[];

const SELF_EMPLOYMENT_TRADES = [
  "artisan",
  "handicraft",
  "craft",
  "weav",
  "tailor",
  "pottery",
  "carpent",
  "cobbler",
  "blacksmith",
  "beautician",
  "repair",
];

// Keyword hints used to check a scheme's target persona against whatever
// the citizen told us about their work. Matching is substring-based on a
// lowercased haystack, so "poultry farming unit" hits the farmer persona.
// The entrepreneur list deliberately includes the self-employment trades:
// someone running their own tailoring unit is an entrepreneur, and the
// broad-persona schemes are exactly the ones meant to fund them.
const PERSONA_KEYWORDS: Record<TargetPersona, string[]> = {
  entrepreneur: [
    "business",
    "trade",
    "shop",
    "retail",
    "manufactur",
    "service",
    "industry",
    "transport",
    "vendor",
    "enterprise",
    "unit",
    "self-employ",
    ...SELF_EMPLOYMENT_TRADES,
  ],
  student: ["student", "education", "college", "university", "course", "degree"],
  women_entrepreneur: [
    "business",
    "trade",
    "shop",
    "retail",
    "service",
    "unit",
    ...SELF_EMPLOYMENT_TRADES,
  ],
  farmer: [
    "agricultur",
    "farm",
    "dairy",
    "livestock",
    "cattle",
    "goat",
    "poultry",
    "fisher",
    "horticultur",
  ],
  artisan: SELF_EMPLOYMENT_TRADES,
  any: [],
};

const EDUCATION_STATUS_FIT: Record<string, number> = {
  postgraduate: 1,
  graduate: 1,
  secondary: 0.85,
  none: 0.6,
};

export interface PartnerAvailability {
  /** Distance to the closest partner still accepting this scheme, or
   *  null when the citizen shared no coordinates. */
  nearestKm: number | null;
  /** Whether any partner anywhere is currently accepting this scheme. */
  hasServiceablePartner: boolean;
}

const occupationHaystack = (profile: CitizenProfile) =>
  [
    profile.occupationCategory,
    profile.occupationType,
    profile.customOccupation,
    profile.projectType,
    profile.course,
    profile.skillCategory,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const scoreIntent = (
  profile: CitizenProfile,
  scheme: RankableScheme,
): number => {
  const affinity = INTENT_CATEGORY_AFFINITY[profile.intent][scheme.category];
  if (affinity === undefined) return 0;
  // A women-only scheme is a perfect fit for the applicant it exists for.
  if (scheme.genderEligibility === "women_only" && profile.gender === "female") {
    return 1;
  }
  return affinity;
};

const scoreLoanAmount = (
  profile: CitizenProfile,
  scheme: RankableScheme,
): number => {
  const required = profile.requiredLoanAmount;
  if (required === undefined) return UNKNOWN;

  const min = Number(scheme.minLoanAmount);
  const max = Number(scheme.maxLoanAmount);

  if (required < min) return clamp01(required / min); // scheme is oversized
  if (required > max) return clamp01(max / required); // covers only part
  return 1;
};

/**
 * What the money costs the borrower. Without this, two schemes with
 * identical limits rank identically even when one charges 6.5% and the
 * other 15% — which is the single biggest difference between NSFDC's
 * own credit lines and the NBFC-MFI routed ones.
 *
 * Scored on the scheme's worst-case beneficiary rate, since that is
 * what the citizen may actually end up paying.
 */
const scoreAffordability = (scheme: RankableScheme): number => {
  const worstRate = Number(scheme.interestRateMaxPercent);
  if (!Number.isFinite(worstRate)) return UNKNOWN;
  return clamp01(
    (WORST_RATE_PERCENT - worstRate) /
      (WORST_RATE_PERCENT - BEST_RATE_PERCENT),
  );
};

const scoreProjectCost = (
  profile: CitizenProfile,
  scheme: RankableScheme,
): number => {
  const cost = profile.estimatedProjectCost;
  if (cost === undefined) return UNKNOWN;

  const fundable = cost * (scheme.maxProjectCostCoveragePercent / 100);
  const max = Number(scheme.maxLoanAmount);
  return fundable <= max ? 1 : clamp01(max / fundable);
};

const scoreOccupation = (
  profile: CitizenProfile,
  scheme: RankableScheme,
): number => {
  if (scheme.targetPersona === "any") return 0.7;
  if (scheme.targetPersona === "student") {
    return profile.intent === "education_loan" ? 1 : 0.3;
  }

  const haystack = occupationHaystack(profile);
  if (!haystack) return 0.6;

  const keywords = PERSONA_KEYWORDS[scheme.targetPersona];
  if (!keywords.some((keyword) => haystack.includes(keyword))) return 0.5;

  // women_entrepreneur only pays out fully for the persona it targets.
  if (scheme.targetPersona === "women_entrepreneur") {
    return profile.gender === "female" ? 1 : 0.5;
  }
  return 1;
};

// Concessional credit is aimed at the lowest incomes in the eligible
// band, so headroom under the ceiling is a genuine ranking signal — but
// it never drops below 0.5, since every candidate already passed the
// hard income filter.
const scoreIncome = (
  profile: CitizenProfile,
  scheme: RankableScheme,
): number => {
  const ceiling = Number(scheme.maxAnnualFamilyIncome);
  if (!(ceiling > 0)) return UNKNOWN;
  return clamp01(0.5 + 0.5 * (1 - profile.annualFamilyIncome / ceiling));
};

const scoreEducation = (
  profile: CitizenProfile,
  scheme: RankableScheme,
): number => {
  // Education status is not a differentiator outside education loans;
  // a flat value keeps it from skewing business-loan rankings.
  if (profile.intent !== "education_loan") return 0.8;

  const base = profile.educationStatus
    ? (EDUCATION_STATUS_FIT[profile.educationStatus] ?? UNKNOWN)
    : UNKNOWN;

  // Schemes that fund only recognised institutions need a named course
  // before the fit can be taken at face value.
  const needsRecognisedCourse =
    scheme.eligibilityRules?.requiresRecognizedInstitution === true;
  return needsRecognisedCourse && !profile.course ? base * 0.8 : base;
};

const scoreLocation = (availability: PartnerAvailability): number => {
  if (!availability.hasServiceablePartner) return NO_PARTNER_PENALTY;
  if (availability.nearestKm === null) return 0.6; // no coordinates shared
  return Math.max(
    NO_PARTNER_PENALTY,
    clamp01(1 - availability.nearestKm / MAX_CONSIDERED_RADIUS_KM),
  );
};

export const scoreScheme = (
  profile: CitizenProfile,
  scheme: RankableScheme,
  availability: PartnerAvailability,
): SchemeSignals => ({
  intent: round2(scoreIntent(profile, scheme)),
  loanAmount: round2(scoreLoanAmount(profile, scheme)),
  affordability: round2(scoreAffordability(scheme)),
  projectCost: round2(scoreProjectCost(profile, scheme)),
  occupation: round2(scoreOccupation(profile, scheme)),
  income: round2(scoreIncome(profile, scheme)),
  education: round2(scoreEducation(profile, scheme)),
  location: round2(scoreLocation(availability)),
});

/** Signals converted into the point budget the citizen is shown. */
export const toScoreBreakdown = (signals: SchemeSignals): ScoreBreakdown => ({
  intentFit: round2(POINTS.intentFit * signals.intent),
  loanAmountFit: round2(
    POINTS.loanAmountFit *
      (LOAN_BAND_SHARE * signals.loanAmount +
        AFFORDABILITY_SHARE * signals.affordability),
  ),
  projectCostFit: round2(POINTS.projectCostFit * signals.projectCost),
  occupationFit: round2(POINTS.occupationFit * signals.occupation),
  incomeFit: round2(POINTS.incomeFit * signals.income),
  educationFit: round2(POINTS.educationFit * signals.education),
  locationFit: round2(POINTS.locationFit * signals.location),
});

/** The match score is simply the points, totalled. */
export const compositeScore = (breakdown: ScoreBreakdown): number =>
  round2(
    (Object.keys(POINTS) as (keyof ScoreBreakdown)[]).reduce(
      (sum, key) => sum + breakdown[key],
      0,
    ),
  );

const inr = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;

const months = (min: number, max: number) =>
  min === max ? `${min} months` : `${min}–${max} months`;

/**
 * Fixed-template explanation. Every clause is derived from the numbers
 * already computed above, so the text a citizen sees cannot drift
 * between two identical requests.
 */
export const buildReasoning = (
  profile: CitizenProfile,
  scheme: RankableScheme,
  availability: PartnerAvailability,
): string => {
  const clauses: string[] = [];

  const min = Number(scheme.minLoanAmount);
  const max = Number(scheme.maxLoanAmount);
  const required = profile.requiredLoanAmount;

  if (required === undefined) {
    clauses.push(`Lends between ${inr(min)} and ${inr(max)}`);
  } else if (required >= min && required <= max) {
    clauses.push(
      `Your ${inr(required)} requirement sits inside its ${inr(min)}–${inr(max)} lending band`,
    );
  } else if (required > max) {
    clauses.push(
      `Covers ${inr(max)} of your ${inr(required)} requirement — the scheme ceiling`,
    );
  } else {
    clauses.push(
      `Starts at ${inr(min)}, above the ${inr(required)} you asked for`,
    );
  }

  const rateMin = Number(scheme.interestRateMinPercent);
  const rateMax = Number(scheme.interestRateMaxPercent);
  clauses.push(
    rateMin === rateMax
      ? `at ${rateMin}% interest over ${scheme.repaymentTenureMonths} months`
      : `at ${rateMin}–${rateMax}% interest over ${scheme.repaymentTenureMonths} months`,
  );

  if (profile.estimatedProjectCost !== undefined) {
    clauses.push(
      `funding up to ${scheme.maxProjectCostCoveragePercent}% of your ${inr(profile.estimatedProjectCost)} project cost`,
    );
  }

  const sentences = [`${clauses.join(", ")}.`];

  sentences.push(
    `Your family income of ${inr(profile.annualFamilyIncome)} is within the ${inr(Number(scheme.maxAnnualFamilyIncome))} ceiling, and repayment begins after a moratorium of ${months(scheme.moratoriumMonthsMin, scheme.moratoriumMonthsMax)}.`,
  );

  if (rateMax > BEST_RATE_PERCENT) {
    sentences.push(
      `Note that at ${rateMax}% this is not the cheapest option available to you.`,
    );
  }

  if (!availability.hasServiceablePartner) {
    sentences.push(
      "No channel partner is accepting applications for this scheme right now, so expect a wait.",
    );
  } else if (availability.nearestKm !== null) {
    sentences.push(
      `The nearest partner accepting this scheme is about ${Math.round(availability.nearestKm)} km away.`,
    );
  }

  return sentences.join(" ");
};

const BASE_DOCUMENTS = [
  "Aadhaar card",
  "Caste certificate (Scheduled Caste)",
  "Annual family income certificate",
  "Proof of residence",
  "Recent passport-size photograph",
  "Bank account passbook",
];

/** Document checklist derived from the scheme row — no LLM, no guessing. */
export const requiredDocumentsFor = (scheme: RankableScheme): string[] => {
  const documents = [...BASE_DOCUMENTS];

  if (scheme.category === "education_loan") {
    documents.push(
      "Admission letter from the institution",
      "Fee structure for the course",
      "Previous academic mark sheets",
    );
  } else if (scheme.category === "skill_training") {
    documents.push("Training course details from the recognised institute");
  } else {
    documents.push(
      "Project report with estimated cost",
      "Quotations for equipment or stock",
    );
  }

  if (scheme.eligibilityRules?.requiresRecognizedInstitution === true) {
    documents.push("Proof that the institution is recognised/accredited");
  }

  return documents;
};
