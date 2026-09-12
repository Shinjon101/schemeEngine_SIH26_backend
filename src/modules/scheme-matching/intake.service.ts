import { HttpError } from "../../common/http-error";
import { getLogger } from "../../config/logger";
import type { CitizenInputProfile } from "../../db/schema";
import { completeJson } from "./llm-client";
import { buildIntakeSystemPrompt } from "./intake.prompt";
import {
  intakeExtractionSchema,
  intakeExtractionJsonSchema,
} from "./intake.schema";
import {
  findOrCreateActiveSession,
  updateSession,
} from "./intake-session.repository";
import {
  DEFAULT_LANGUAGE_CODE,
  isSupportedLanguage,
  NO_MATCH_MESSAGE,
  type SupportedLanguageCode,
} from "./languages";
import { missingRequiredFields } from "./scheme-matching.schema";
import { matchSchemesForCitizen } from "./scheme-matching.service";

const logger = getLogger("intake-service");

const INTAKE_SAMPLING_SEED = 20260101;

const mergeProfile = (
  known: Partial<CitizenInputProfile>,
  extracted: Record<string, unknown>,
): Partial<CitizenInputProfile> => {
  const merged: Record<string, unknown> = { ...known };
  for (const [key, value] of Object.entries(extracted)) {
    // null means "this turn said nothing about it", not "clear it".
    // `false` is a real answer to isScheduledCaste and must survive.
    if (value !== null && value !== undefined) {
      merged[key] = value;
    }
  }
  return merged as Partial<CitizenInputProfile>;
};

export const handleCitizenMessage = async (
  rawMessage: string,
  channelId: string,
  userId?: string,
  preferredLanguage?: SupportedLanguageCode,
) => {
  const session = await findOrCreateActiveSession(channelId, userId);

  // Used only when a message has no language of its own ("32", "yes"): keep
  // speaking whatever the conversation is already in, and before the first
  // turn, the language the portal is set to.
  const conversationLanguage =
    session.detectedLanguage && isSupportedLanguage(session.detectedLanguage)
      ? session.detectedLanguage
      : undefined;
  const fallbackLanguage =
    conversationLanguage ?? preferredLanguage ?? DEFAULT_LANGUAGE_CODE;

  const completion = await completeJson(
    buildIntakeSystemPrompt(
      session.profile,
      session.missingFields,
      fallbackLanguage,
    ),
    rawMessage,
    { name: "citizen_intake", schema: intakeExtractionJsonSchema },
    // Extraction is a parsing job, not a creative one: the same message
    // must always yield the same fields, or the citizen gets asked for
    // something they already told us.
    { temperature: 0, seed: INTAKE_SAMPLING_SEED },
  );

  let extraction;
  try {
    extraction = intakeExtractionSchema.parse(JSON.parse(completion));
  } catch (error) {
    logger.error({ err: error }, "LLM returned invalid intake data");
    throw HttpError.unprocessable(
      "Scheme matching service returned invalid intake data",
    );
  }

  const mergedProfile = mergeProfile(
    session.profile,
    extraction.extractedProfile,
  );

  // The language the reply was actually written in. Stored on the session,
  // it becomes the fallback for the next turn and the language the scheme
  // summaries are generated in.
  const responseLanguage = extraction.detectedLanguage;

  // Authoritative check, using the same required-field rules the web
  // wizard validates against — the LLM's own missingRequiredFields is a
  // hint for phrasing clarifyingQuestion, not something control flow
  // trusts. Because the rule set is intent-conditional, an education
  // applicant is asked for their course and a trader is not.
  const stillMissing = missingRequiredFields(
    mergedProfile as Record<string, unknown>,
  );

  if (stillMissing.length > 0) {
    await updateSession(session.id, {
      profile: mergedProfile,
      missingFields: stillMissing,
      detectedLanguage: responseLanguage,
      turnCount: session.turnCount + 1,
    });

    return {
      status: "needs_clarification" as const,
      language: responseLanguage,
      question: extraction.clarifyingQuestion,
      missingFields: stillMissing,
      partialProfile: mergedProfile,
    };
  }

  try {
    const matches = await matchSchemesForCitizen(mergedProfile, userId);

    await updateSession(session.id, {
      profile: mergedProfile,
      missingFields: [],
      detectedLanguage: responseLanguage,
      status: "matched",
      turnCount: session.turnCount + 1,
    });

    return {
      status: "matched" as const,
      language: responseLanguage,
      matches,
      // Lets the client follow up on /scheme-matching/summary without
      // having to re-send the whole profile it never assembled.
      channelId,
    };
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 404) {
      await updateSession(session.id, {
        profile: mergedProfile,
        missingFields: [],
        detectedLanguage: responseLanguage,
        status: "no_match",
        turnCount: session.turnCount + 1,
      });

      return {
        status: "no_match" as const,
        language: responseLanguage,
        message: NO_MATCH_MESSAGE[responseLanguage],
      };
    }
    throw error;
  }
};
