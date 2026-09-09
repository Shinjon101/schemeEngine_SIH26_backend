import { HttpError } from "../../common/http-error";
import { completeJson } from "./llm-client";
import { buildIntakeSystemPrompt } from "./intake.prompt";
import { intakeExtractionSchema, REQUIRED_FIELDS } from "./intake.schema";
import { matchSchemesForCitizen } from "./scheme-matching.service";
import { getLogger } from "../../config/logger";

const logger = getLogger("intake-service");

// Entry point for raw citizen text — WhatsApp bot, web chat widget,
// wherever the message originates. Merges naturally with a multi-turn
// flow: the caller keeps the last partialProfile and re-sends the
// citizen's next reply, repeating until status is "matched".
export const handleCitizenMessage = async (
  rawMessage: string,
  userId?: string,
) => {
  const completion = await completeJson(buildIntakeSystemPrompt(), rawMessage);
  let extraction;
  try {
    extraction = intakeExtractionSchema.parse(JSON.parse(completion));
  } catch (error) {
    logger.error({ err: error }, "LLM returned invalid intake data");
    throw HttpError.unprocessable(
      "Scheme matching service returned invalid intake data",
    );
  }

  const stillMissing = REQUIRED_FIELDS.filter(
    (field) => extraction.extractedProfile[field] === null,
  );

  if (stillMissing.length > 0) {
    return {
      status: "needs_clarification" as const,
      language: extraction.detectedLanguage,
      question: extraction.clarifyingQuestion,
      partialProfile: extraction.extractedProfile,
    };
  }

  const matches = await matchSchemesForCitizen(
    extraction.extractedProfile,
    userId,
  );

  return {
    status: "matched" as const,
    language: extraction.detectedLanguage,
    matches,
  };
};
