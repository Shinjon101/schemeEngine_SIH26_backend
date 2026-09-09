import { HttpError } from "../../common/http-error";
import { db } from "../../db";
import { schemeRecommendations } from "../../db/schema";
import { completeJson } from "./llm-client";
import { buildSystemPrompt, buildUserPrompt } from "./scheme-matching.prompt";
import { findCandidateSchemes } from "./scheme-matching.repository";
import {
  citizenProfileSchema,
  llmMatchSchema,
  llmMatchJsonSchema,
  type CitizenProfile,
} from "./scheme-matching.schema";

export const matchSchemesForCitizen = async (
  rawProfile: unknown,
  userId?: string,
) => {
  const profile: CitizenProfile = citizenProfileSchema.parse(rawProfile);

  const candidates = await findCandidateSchemes(profile);

  if (candidates.length === 0) {
    throw HttpError.notFound(
      "No schemes currently match this profile's income and category",
    );
  }

  const rawCompletion = await completeJson(
    buildSystemPrompt(),
    buildUserPrompt(profile, candidates),
    { name: "scheme_matches", schema: llmMatchJsonSchema },
  );

  // Even with strict-mode structured outputs, the completion is still
  // an untrusted string over the wire (truncation, timeout retries,
  // provider-side hiccups) — never JSON.parse it unguarded.
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawCompletion);
  } catch (error) {
    throw HttpError.unprocessable(
      "Scheme matching service returned malformed data",
    );
  }

  const { matches } = llmMatchSchema.parse(parsedJson);

  const candidateByCode = new Map(candidates.map((c) => [c.code, c]));

  // Cross-check every match against the actual candidate set. If the
  // LLM returns a schemeCode we didn't send it, that's a hallucination
  // — drop it silently rather than surfacing a scheme that was never
  // eligibility-checked.
  const resolvedMatches = matches
    .map((match) => {
      const scheme = candidateByCode.get(match.schemeCode);
      if (!scheme) return null;
      return {
        scheme,
        matchScore: match.matchScore,
        reasoning: match.reasoning,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  if (resolvedMatches.length === 0) {
    throw HttpError.unprocessable(
      "Scheme matching service could not produce a valid recommendation",
    );
  }

  await db.insert(schemeRecommendations).values(
    resolvedMatches.map((m) => ({
      userId: userId ?? null,
      inputProfile: profile,
      recommendedSchemeId: m.scheme.id,
      matchScore: m.matchScore.toString(),
      reasoning: m.reasoning,
    })),
  );

  return resolvedMatches.map((m) => ({
    schemeCode: m.scheme.code,
    schemeName: m.scheme.name,
    matchScore: m.matchScore,
    reasoning: m.reasoning,
    maxLoanAmount: m.scheme.maxLoanAmount,
  }));
};
