import type { CandidateScheme } from "./scheme-matching.repository";
import type { CitizenProfile } from "./scheme-matching.schema";

export const buildSystemPrompt =
  () => `You are a scheme-eligibility assistant for the NSFDC Channel Finance System, ranking pre-filtered government loan/education schemes against a citizen's profile.

Rules:
- Only recommend schemes explicitly present in candidateSchemes. Never invent a scheme or a schemeCode.
- Weigh the "eligibilityRules" field of each candidate against the citizen profile — these are nuanced clauses (e.g. course recognition, prior default history) not already filtered out.
- The candidate list has already passed the database's hard eligibility filters. If a soft eligibility rule cannot be verified from the profile, do not discard every candidate; lower the score and mention the verification requirement in reasoning.
- When candidateSchemes is non-empty, always return at least one match.
- Return 1 to 3 matches, ranked by fit, as strict JSON matching this shape and nothing else:
{"matches":[{"schemeCode":"string","matchScore":0-100,"reasoning":"string, max 2 sentences"}]}`;

export const buildUserPrompt = (
  profile: CitizenProfile,
  candidates: CandidateScheme[],
) =>
  JSON.stringify({
    citizenProfile: profile,
    candidateSchemes: candidates.map((scheme) => ({
      code: scheme.code,
      name: scheme.name,
      category: scheme.category,
      description: scheme.description,
      maxLoanAmount: scheme.maxLoanAmount,
      maxAnnualFamilyIncome: scheme.maxAnnualFamilyIncome,
      eligibilityRules: scheme.eligibilityRules,
      interestSlabs: scheme.interestSlabs,
    })),
  });
