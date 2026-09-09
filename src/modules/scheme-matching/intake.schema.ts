import { z } from "zod";

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

export const REQUIRED_FIELDS = [
  "intent",
  "annualFamilyIncome",
  "age",
  "gender",
] as const;
