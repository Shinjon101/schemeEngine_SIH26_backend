import { HttpError } from "../../common/http-error";
import { getLogger } from "../../config/logger";
import { findLatestSessionByChannel } from "./intake-session.repository";
import { completeJson } from "./llm-client";
import {
  citizenProfileSchema,
  missingRequiredFields,
  type CitizenProfile,
} from "./scheme-matching.schema";
import {
  buildRecommendations,
  type RankedScheme,
} from "./scheme-matching.service";
import {
  buildSummaryUserPrompt,
  buildSummarySystemPrompt,
} from "./scheme-summary.prompt";
import {
  schemeSummaryJsonSchema,
  schemeSummaryLlmSchema,
  type SchemeSummaryRequest,
} from "./scheme-summary.schema";

const logger = getLogger("scheme-summary-service");

const DEFAULT_LANGUAGE = "en";

interface ResolvedContext {
  profile: CitizenProfile;
  language: string;
}

/**
 * Both intakes end up here. The wizard hands over a complete profile;
 * the chatbot hands over a channel id and the profile is read back off
 * the session it has been filling in turn by turn.
 */
const resolveContext = async (
  request: SchemeSummaryRequest,
): Promise<ResolvedContext> => {
  let rawProfile: Record<string, unknown>;
  let sessionLanguage: string | null = null;

  if (request.channelId) {
    const session = await findLatestSessionByChannel(request.channelId);
    if (!session) {
      throw HttpError.notFound("No intake session found for this channel");
    }
    rawProfile = session.profile as Record<string, unknown>;
    sessionLanguage = session.detectedLanguage;
  } else {
    rawProfile = request.profile as Record<string, unknown>;
  }

  const parsed = citizenProfileSchema.safeParse(rawProfile);
  if (!parsed.success) {
    throw HttpError.unprocessable(
      "The intake profile is incomplete, so its recommendations cannot be summarised",
      { missingFields: missingRequiredFields(rawProfile) },
    );
  }

  return {
    profile: parsed.data,
    language: request.language ?? sessionLanguage ?? DEFAULT_LANGUAGE,
  };
};

export const summariseRecommendations = async (
  request: SchemeSummaryRequest,
) => {
  const { profile, language } = await resolveContext(request);

  // Re-derived, not re-decided: buildRecommendations is deterministic,
  // so this reproduces exactly the ranking the citizen was already
  // shown, without writing a second recommendation row for the same
  // profile.
  const { matches, candidates } = await buildRecommendations(profile);

  const requestedCodes = request.schemeCodes;
  const selected: RankedScheme[] = requestedCodes
    ? matches.filter((match) => requestedCodes.includes(match.schemeCode))
    : matches;

  if (selected.length === 0) {
    throw HttpError.notFound(
      "None of the requested schemes are part of this profile's recommendations",
    );
  }

  const schemesByCode = new Map(
    candidates.map((scheme) => [scheme.code, scheme]),
  );

  const rawCompletion = await completeJson(
    buildSummarySystemPrompt(),
    buildSummaryUserPrompt(profile, selected, schemesByCode, language),
    { name: "scheme_summary", schema: schemeSummaryJsonSchema },
  );

  let parsed;
  try {
    parsed = schemeSummaryLlmSchema.parse(JSON.parse(rawCompletion));
  } catch (error) {
    logger.error({ err: error }, "LLM returned invalid scheme summary");
    throw HttpError.unprocessable(
      "Scheme summarisation service returned malformed data",
    );
  }

  // Structured output is still untrusted wire data: drop anything the
  // model wrote about a scheme that was not on the recommendation list.
  const selectedByCode = new Map(
    selected.map((match) => [match.schemeCode, match]),
  );
  const schemeSummaries = parsed.schemes
    .filter((summary) => selectedByCode.has(summary.schemeCode))
    .map((summary) => {
      const match = selectedByCode.get(summary.schemeCode)!;
      return {
        ...summary,
        schemeId: match.schemeId,
        schemeName: match.schemeName,
        matchScore: match.matchScore,
      };
    });

  if (schemeSummaries.length === 0) {
    throw HttpError.unprocessable(
      "Scheme summarisation service did not describe any recommended scheme",
    );
  }

  return {
    // Echo the language we asked for, not the one the model claims to
    // have written in — the caller renders on the strength of this.
    language,
    overallSummary: parsed.overallSummary,
    schemeSummaries,
    // Returned so a caller that only held a channelId still gets the
    // deterministic ranking alongside its explanation.
    matches: selected,
  };
};
