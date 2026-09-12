import type { CandidateScheme } from "./scheme-matching.repository";
import type { CitizenProfile } from "./scheme-matching.schema";
import type { RankedScheme } from "./scheme-matching.service";

const INTENT_NARRATIVE: Record<CitizenProfile["intent"], string> = {
  business_loan:
    "wants credit to start or grow an income-generating enterprise of their own",
  education_loan:
    "wants to finance a course of study for themselves or a dependant",
  skill_training:
    "wants funded vocational training to become employable or self-employed",
};

export const buildSummarySystemPrompt =
  (): string => `You explain NSFDC Channel Finance scheme recommendations to a citizen in plain, respectful language. The citizen is usually a first-time borrower from a Scheduled Caste household and may have limited experience with formal banking.

The ranking has ALREADY been decided by a deterministic rules engine before you were called. Your job is to explain it, never to re-decide it.

Rules:
- Write for the citizen, in the second person ("you"), not about them.
- Explain ONLY the schemes listed in recommendedSchemes, using the exact schemeCode values given. Never introduce, invent, or hint at another scheme.
- Ground every claim in the scheme data supplied — the description, the amounts, the interest rate, the moratorium, the tenure, and the eligibility rules. Never state a figure that is not in that data, and never round a figure into a different number.
- Connect each scheme back to what the citizen actually told us in citizenContext: their stated need, the amount they asked for, their income, and their situation. That connection is the whole point of whyItFits.
- Do not restate or re-rank the match scores, and do not tell the citizen one scheme "scored higher" than another. Describe fit in words.
- Where a scheme only partly covers what the citizen asked for, or where an eligibility rule still has to be verified, say so plainly instead of glossing over it.
- keyTerms: up to 5 short factual bullets — loan ceiling, interest rate, moratorium, repayment tenure, coverage percentage. Figures only, no advice.
- nextSteps: up to 4 concrete actions, such as documents to gather or approaching an authorised channel partner. Remember that NSFDC does not accept direct applications — funds are routed through channel partners (SCAs, public sector banks, regional rural banks, NBFC-MFIs).
- overallSummary: 3-5 sentences framing the whole set — what the citizen asked for, which option leads and why, and what to do next.
- Write every citizen-facing string in the language given by outputLanguage (an ISO code). If it is not "en", write in that language's own script, not transliteration. Echo that same code back in the "language" field.
- Never promise approval, a disbursement date, or an outcome. These are recommendations, not sanctions.
- Respond with strict JSON only, matching the supplied schema. Do not wrap the response in markdown code fences.`;

export const buildSummaryUserPrompt = (
  profile: CitizenProfile,
  matches: RankedScheme[],
  schemesByCode: Map<string, CandidateScheme>,
  outputLanguage: string,
): string =>
  JSON.stringify({
    outputLanguage,
    citizenContext: {
      // The intent narrative is what turns a bare enum into something
      // the model can actually write a sentence about.
      statedNeed: INTENT_NARRATIVE[profile.intent],
      intent: profile.intent,
      projectOrTrade: profile.projectType ?? null,
      course: profile.course ?? null,
      amountRequested: profile.requiredLoanAmount ?? null,
      estimatedProjectCost: profile.estimatedProjectCost ?? null,
      annualFamilyIncome: profile.annualFamilyIncome,
      age: profile.age,
      gender: profile.gender,
      educationStatus: profile.educationStatus ?? null,
      occupation:
        profile.customOccupation ??
        profile.occupationType ??
        profile.occupationCategory ??
        null,
      state: profile.state,
      district: profile.district,
      isScheduledCaste: profile.isScheduledCaste,
    },
    recommendedSchemes: matches.map((match) => {
      const scheme = schemesByCode.get(match.schemeCode);
      return {
        schemeCode: match.schemeCode,
        name: match.schemeName,
        category: scheme?.category ?? null,
        description: scheme?.description ?? null,
        eligibilityRules: scheme?.eligibilityRules ?? {},
        interestSlabs: scheme?.interestSlabs ?? [],
        minLoanAmount: match.minLoanAmount,
        maxLoanAmount: match.maxLoanAmount,
        maxProjectCostCoveragePercent:
          scheme?.maxProjectCostCoveragePercent ?? null,
        interestRatePercent: {
          min: match.interestRateMin,
          max: match.interestRateMax,
        },
        moratoriumMonths: {
          min: match.moratoriumMonthsMin,
          max: match.moratoriumMonthsMax,
        },
        repaymentTenureMonths: match.repaymentTenureMonths,
        requiredDocuments: match.requiredDocuments,
        // The rules engine's own justification. Paraphrase it for the
        // citizen; do not contradict it.
        rulesEngineFinding: match.reasoning,
      };
    }),
  });
