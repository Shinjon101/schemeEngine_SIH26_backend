import { z } from "zod";

export const INTENTS = [
  "business_loan",
  "education_loan",
  "skill_training",
] as const;
export const GENDERS = ["male", "female", "other"] as const;
export const EDUCATION_STATUSES = [
  "none",
  "secondary",
  "graduate",
  "postgraduate",
] as const;

export type Intent = (typeof INTENTS)[number];

// Fields every profile needs regardless of what the citizen is asking
// for. These are exactly the ones the Postgres candidate query filters
// on, which is why the conversational intake refuses to move on to a
// recommendation until all of them are collected.
export const COMMON_REQUIRED_FIELDS = [
  "intent",
  "isScheduledCaste",
  "age",
  "gender",
  "annualFamilyIncome",
  "state",
  "district",
] as const;

// Additional fields that only make sense — and only become mandatory —
// once the intent is known. Asking an education-loan applicant for a
// "project type" (or a trainee for a loan amount) produces noise, so
// the requirement set is intent-conditional.
// Kept deliberately in step with the web wizard's own per-intent
// validation (frontend-lk/src/lib/schemas/scheme-matching.ts): the API
// must not reject a payload the UI considers complete. skill_training
// blocks on nothing extra — a trainee often cannot name a trade or an
// amount yet, and the wizard does not ask them to.
export const INTENT_REQUIRED_FIELDS: Record<Intent, readonly string[]> = {
  business_loan: ["projectType", "requiredLoanAmount"],
  education_loan: ["course", "educationStatus", "requiredLoanAmount"],
  skill_training: [],
};

/**
 * The one place that answers "what still has to be collected?".
 * Both intakes and the profile validator read from it, so the web
 * wizard and the chatbot can never disagree about completeness.
 */
export const requiredFieldsFor = (intent?: Intent | null): string[] =>
  intent
    ? [...COMMON_REQUIRED_FIELDS, ...INTENT_REQUIRED_FIELDS[intent]]
    : [...COMMON_REQUIRED_FIELDS];

const isBlank = (value: unknown) =>
  value === null || value === undefined || value === "";

export const profileShape = {
  intent: z.enum(INTENTS),
  isScheduledCaste: z.boolean(),
  annualFamilyIncome: z.number().nonnegative(),
  age: z.number().int().min(0).max(120),
  gender: z.enum(GENDERS),
  state: z.string().min(1).max(100),
  district: z.string().min(1).max(100),

  projectType: z.string().min(1).max(200).optional(),
  course: z.string().min(1).max(200).optional(),
  // The wizard already collects this on its skill-training step; accepted
  // here so that path has something to rank on beyond placeholders.
  skillCategory: z.string().min(1).max(200).optional(),
  educationStatus: z.enum(EDUCATION_STATUSES).optional(),
  requiredLoanAmount: z.number().positive().optional(),
  estimatedProjectCost: z.number().positive().optional(),
  occupationCategory: z.string().min(1).max(100).optional(),
  occupationType: z.string().min(1).max(100).optional(),
  customOccupation: z.string().min(1).max(200).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
};

export const citizenProfileSchema = z
  .object(profileShape)
  .superRefine((profile, ctx) => {
    for (const field of INTENT_REQUIRED_FIELDS[profile.intent]) {
      if (isBlank((profile as Record<string, unknown>)[field])) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `${field} is required when intent is ${profile.intent}`,
        });
      }
    }

    // Geo is only usable as a pair; a lone coordinate would score every
    // scheme's partner proximity as "unknown" anyway.
    if ((profile.latitude === undefined) !== (profile.longitude === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["latitude"],
        message: "latitude and longitude must be provided together",
      });
    }
  });

export type CitizenProfile = z.infer<typeof citizenProfileSchema>;

/** Which of the required fields are still blank on a partial profile. */
export const missingRequiredFields = (
  profile: Record<string, unknown>,
): string[] =>
  requiredFieldsFor(profile.intent as Intent | undefined).filter((field) =>
    isBlank(profile[field]),
  );
