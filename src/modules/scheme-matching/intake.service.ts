import { HttpError } from "../../common/http-error";
import { getLogger } from "../../config/logger";
import type { CitizenInputProfile } from "../../db/schema";
import { completeJson } from "./llm-client";
import { buildIntakeSystemPrompt } from "./intake.prompt";
import {
  intakeExtractionSchema,
  intakeExtractionJsonSchema,
  REQUIRED_FIELDS,
} from "./intake.schema";
import {
  findOrCreateActiveSession,
  updateSession,
} from "./intake-session.repository";
import { matchSchemesForCitizen } from "./scheme-matching.service";

const logger = getLogger("intake-service");

// Shown to the citizen when their (complete) profile matched no active
// scheme. Keep this map small and add languages as the schemes.json
// content is localized — it's deliberately separate from the LLM's own
// clarifying-question generation, since "no schemes fit" is a fixed,
// reviewable message rather than something worth improvising per-turn.
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
    if (value !== null && value !== undefined) {
      merged[key] = value;
    }
  }
  return merged as Partial<CitizenInputProfile>;
};

// Entry point for raw citizen text — WhatsApp bot, web chat widget,
// wherever the message originates. `channelId` (phone number or web
// session token) is the correlation key across turns: it's what lets
// this function find the citizen's in-progress conversation and merge
// this message's extracted fields into what was already collected,
// rather than re-deriving the whole profile from a single message.
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

  // Authoritative check — the LLM's own missingRequiredFields is a hint
  // for phrasing clarifyingQuestion, not something control flow trusts.
  const stillMissing = REQUIRED_FIELDS.filter((field) => {
    const value = (mergedProfile as Record<string, unknown>)[field];
    return value === null || value === undefined || value === "";
  });

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
    };
  } catch (error) {
    // A complete profile that matches no scheme is an expected outcome,
    // not a failure — close the session out and tell the citizen in
    // their own language, instead of letting the generic English error
    // handler respond (which is what happened before this fix).
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
