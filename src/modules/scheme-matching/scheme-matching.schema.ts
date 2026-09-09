import { z } from "zod";

export const citizenProfileSchema = z.object({
  annualFamilyIncome: z.number().nonnegative(),
  age: z.number().int().min(0).max(120),
  gender: z.enum(["male", "female", "other"]),
  projectType: z.string().min(1).max(200), // free text, e.g. "tailoring unit", "poultry farm"
  estimatedProjectCost: z.number().positive().optional(),
  educationStatus: z
    .enum(["none", "secondary", "graduate", "postgraduate"])
    .optional(),
  intent: z.enum(["business_loan", "education_loan", "skill_training"]),
});

export type CitizenProfile = z.infer<typeof citizenProfileSchema>;

// Strict shape the LLM must return. Kept small and flat on purpose —
// the LLM's only job is to rank and justify, not to restate scheme
// data it might get wrong.
export const llmMatchSchema = z.object({
  matches: z
    .array(
      z.object({
        schemeCode: z.string(),
        matchScore: z.number().min(0).max(100),
        reasoning: z.string().min(1).max(500),
      }),
    )
    .min(1)
    .max(3),
});

export type LlmMatchResult = z.infer<typeof llmMatchSchema>;
