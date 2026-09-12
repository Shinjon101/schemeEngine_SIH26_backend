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
import { missingRequiredFields } from "./scheme-matching.schema";
import { matchSchemesForCitizen } from "./scheme-matching.service";

const logger = getLogger("intake-service");

const INTAKE_SAMPLING_SEED = 20260101;

const NO_MATCH_MESSAGE: Record<string, string> = {
  en: "We couldn't find a scheme matching your profile right now. A representative may follow up.",
  hi: "फ़िलहाल आपकी प्रोफ़ाइल से मेल खाती कोई योजना नहीं मिली। कोई प्रतिनिधि जल्द संपर्क करेगा।",
};

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
) => {
  const session = await findOrCreateActiveSession(channelId, userId);

  const completion = await completeJson(
    buildIntakeSystemPrompt(session.profile, session.missingFields),
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
      detectedLanguage: extraction.detectedLanguage,
      turnCount: session.turnCount + 1,
    });

    return {
      status: "needs_clarification" as const,
      language: extraction.detectedLanguage,
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
      detectedLanguage: extraction.detectedLanguage,
      status: "matched",
      turnCount: session.turnCount + 1,
    });

    return {
      status: "matched" as const,
      language: extraction.detectedLanguage,
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
        detectedLanguage: extraction.detectedLanguage,
        status: "no_match",
        turnCount: session.turnCount + 1,
      });

      return {
        status: "no_match" as const,
        language: extraction.detectedLanguage,
        message:
          NO_MATCH_MESSAGE[extraction.detectedLanguage] ?? NO_MATCH_MESSAGE.en,
      };
    }
    throw error;
  }
};
