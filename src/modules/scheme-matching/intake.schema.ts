import { z } from "zod";
import { toStrictJsonSchema } from "./json-schema.util";
import { SUPPORTED_LANGUAGE_CODES } from "./languages";
import { EDUCATION_STATUSES, GENDERS, INTENTS } from "./scheme-matching.schema";

// Every field the recommendation pipeline can use. The chatbot's job is
// to fill this in over as many turns as it takes, because each value it
// collects is one more filter the Postgres candidate query can apply
// instead of a signal the ranker has to treat as unknown.
export const intakeExtractionSchema = z.object({
  // Constrained so a free-form guess ("und", "ar") can never become the
  // conversation language; the strict JSON schema enforces it at generation.
  detectedLanguage: z.enum(SUPPORTED_LANGUAGE_CODES),
  extractedProfile: z.object({
    intent: z.enum(INTENTS).nullable(),
    isScheduledCaste: z.boolean().nullable(),
    annualFamilyIncome: z.number().nonnegative().nullable(),
    age: z.number().int().nullable(),
    gender: z.enum(GENDERS).nullable(),
    state: z.string().nullable(),
    district: z.string().nullable(),

    projectType: z.string().nullable(),
    course: z.string().nullable(),
    educationStatus: z.enum(EDUCATION_STATUSES).nullable(),
    requiredLoanAmount: z.number().positive().nullable(),
    estimatedProjectCost: z.number().positive().nullable(),
    occupationCategory: z.string().nullable(),
    occupationType: z.string().nullable(),
  }),
  missingRequiredFields: z.array(z.string()),
  // Written by the LLM in the language of the citizen's message, so the
  // app can display it back verbatim without a separate translation call
  clarifyingQuestion: z.string().nullable(),
});

export type IntakeExtraction = z.infer<typeof intakeExtractionSchema>;

// Sent to Groq as the `json_schema` for the intake extraction call.
// Safe to derive directly: every field in intakeExtractionSchema is
// already `.nullable()` rather than `.optional()`, which is exactly
// the shape strict mode requires (always-present, nullable-when-unknown).
export const intakeExtractionJsonSchema = toStrictJsonSchema(
  intakeExtractionSchema,
);

// Fields the chatbot may collect but never blocks on. Asking for them
// improves the ranking; refusing to recommend without them would trap a
// citizen who simply doesn't know their project cost yet.
export const OPTIONAL_INTAKE_FIELDS = [
  "estimatedProjectCost",
  "occupationCategory",
  "occupationType",
] as const;
