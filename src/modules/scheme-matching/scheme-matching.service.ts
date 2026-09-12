import { HttpError } from "../../common/http-error";
import { db } from "../../db";
import { schemeRecommendations } from "../../db/schema";
import {
  findCandidateSchemes,
  findPartnerAvailability,
  type CandidateScheme,
} from "./scheme-matching.repository";
import {
  citizenProfileSchema,
  type CitizenProfile,
} from "./scheme-matching.schema";
import {
  buildReasoning,
  compositeScore,
  MAX_RECOMMENDATIONS,
  requiredDocumentsFor,
  scoreScheme,
  toScoreBreakdown,
  type PartnerAvailability,
  type ScoreBreakdown,
  type SchemeSignals,
} from "./scheme-matching.scoring";

export interface RankedScheme {
  schemeId: string;
  schemeCode: string;
  schemeName: string;
  matchScore: number;
  reasoning: string;
  minLoanAmount: string;
  maxLoanAmount: string;
  interestRateMin: string;
  interestRateMax: string;
  repaymentTenureMonths: number;
  moratoriumMonthsMin: number;
  moratoriumMonthsMax: number;
  requiredDocuments: string[];
  scoreBreakdown: ScoreBreakdown;
  /** The raw 0-1 sub-signals behind the points above, including the
   *  interest-rate affordability that is folded into loanAmountFit. */
  signals: SchemeSignals;
}

const toRankedScheme = (
  profile: CitizenProfile,
  scheme: CandidateScheme,
  availability: PartnerAvailability,
): RankedScheme => {
  const signals = scoreScheme(profile, scheme, availability);
  const scoreBreakdown = toScoreBreakdown(signals);
  return {
    schemeId: scheme.id,
    schemeCode: scheme.code,
    schemeName: scheme.name,
    matchScore: compositeScore(scoreBreakdown),
    reasoning: buildReasoning(profile, scheme, availability),
    minLoanAmount: scheme.minLoanAmount,
    maxLoanAmount: scheme.maxLoanAmount,
    interestRateMin: scheme.interestRateMinPercent,
    interestRateMax: scheme.interestRateMaxPercent,
    repaymentTenureMonths: scheme.repaymentTenureMonths,
    moratoriumMonthsMin: scheme.moratoriumMonthsMin,
    moratoriumMonthsMax: scheme.moratoriumMonthsMax,
    requiredDocuments: requiredDocumentsFor(scheme),
    scoreBreakdown,
    signals,
  };
};

/**
 * Filter, score and rank — with no LLM anywhere in the path.
 *
 * Candidates come back from Postgres already ordered by scheme code, and
 * ties break on that same code, so two identical profiles always produce
 * the same list in the same order. Callers that want prose on top of
 * this call the summarisation route, which explains the ranking rather
 * than deciding it.
 */
export const buildRecommendations = async (
  profile: CitizenProfile,
): Promise<{ matches: RankedScheme[]; candidates: CandidateScheme[] }> => {
  const candidates = await findCandidateSchemes(profile);

  if (candidates.length === 0) {
    throw HttpError.notFound(
      "No schemes currently match this profile's eligibility criteria",
    );
  }

  const availabilityByScheme = await findPartnerAvailability(
    candidates.map((scheme) => scheme.id),
    profile.latitude,
    profile.longitude,
  );

  const fallback: PartnerAvailability = {
    nearestKm: null,
    hasServiceablePartner: false,
  };

  const matches = candidates
    .map((scheme) =>
      toRankedScheme(
        profile,
        scheme,
        availabilityByScheme.get(scheme.id) ?? fallback,
      ),
    )
    .sort(
      (a, b) =>
        b.matchScore - a.matchScore || a.schemeCode.localeCompare(b.schemeCode),
    )
    .slice(0, MAX_RECOMMENDATIONS);

  return { matches, candidates };
};

export const matchSchemesForCitizen = async (
  rawProfile: unknown,
  userId?: string,
) => {
  const profile = citizenProfileSchema.parse(rawProfile);
  const { matches } = await buildRecommendations(profile);

  await db.insert(schemeRecommendations).values(
    matches.map((match) => ({
      userId: userId ?? null,
      inputProfile: profile,
      recommendedSchemeId: match.schemeId,
      matchScore: match.matchScore.toString(),
      reasoning: match.reasoning,
    })),
  );

  return matches;
};
