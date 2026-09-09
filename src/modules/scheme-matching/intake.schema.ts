import { z } from "zod";
import { toStrictJsonSchema } from "./json-schema.util";

export const intakeExtractionSchema = z.object({
  detectedLanguage: z.string(),
  extractedProfile: z.object({
    projectType: z.string().nullable(),
    intent: z
      .enum(["business_loan", "education_loan", "skill_training"])
      .nullable(),
    annualFamilyIncome: z.number().nonnegative().nullable(),
    age: z.number().int().nullable(),
    gender: z.enum(["male", "female", "other"]).nullable(),
    estimatedProjectCost: z.number().positive().nullable(),
    educationStatus: z
      .enum(["none", "secondary", "graduate", "postgraduate"])
      .nullable(),
  }),
  missingRequiredFields: z.array(z.string()),
  // Written by the LLM in the citizen's own detected language, so the
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

// NOTE: `projectType` is required here even though citizenProfileSchema
// (scheme-matching.schema.ts) has always required it — REQUIRED_FIELDS
// previously omitted it, which meant a citizen who never restated their
// project type would sail past the intake "still missing?" check and
// then throw a raw ZodError out of matchSchemesForCitizen. Keeping this
// list and citizenProfileSchema's required fields in sync is what makes
// the "needs_clarification" loop actually terminate in the right place.
export const REQUIRED_FIELDS = [
  "intent",
  "projectType",
  "annualFamilyIncome",
  "age",
  "gender",
] as const;
