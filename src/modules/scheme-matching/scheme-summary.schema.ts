import { z } from "zod";
import { toStrictJsonSchema } from "./json-schema.util";

/**
 * A summary can be requested from either intake:
 *  - the web wizard posts the full `profile` it just collected;
 *  - the conversational intake posts only its `channelId`, and the
 *    profile is read back off the stored session.
 * Exactly one of the two must be supplied.
 */
export const schemeSummaryRequestSchema = z
  .object({
    profile: z.record(z.string(), z.unknown()).optional(),
    channelId: z.string().min(3).max(50).optional(),
    // Restricts the summary to specific schemes. Omit to summarise the
    // whole ranked recommendation set.
    schemeCodes: z.array(z.string().min(1).max(20)).min(1).max(3).optional(),
    // Overrides the language inferred from the intake session.
    language: z.string().min(2).max(10).optional(),
    userId: z.uuid().optional(),
  })
  .refine((body) => Boolean(body.profile) !== Boolean(body.channelId), {
    message: "Provide exactly one of `profile` or `channelId`",
    path: ["profile"],
  });

export type SchemeSummaryRequest = z.infer<typeof schemeSummaryRequestSchema>;

// What the LLM is allowed to return. It explains schemes and a ranking
// that were both decided deterministically upstream — it never supplies
// a score, an ordering, or a scheme that wasn't handed to it.
export const schemeSummaryLlmSchema = z.object({
  language: z.string(),
  overallSummary: z.string().min(1).max(1500),
  schemes: z
    .array(
      z.object({
        schemeCode: z.string(),
        headline: z.string().min(1).max(200),
        whyItFits: z.string().min(1).max(800),
        keyTerms: z.array(z.string().min(1).max(200)).min(1).max(5),
        nextSteps: z.array(z.string().min(1).max(250)).min(1).max(4),
      }),
    )
    .min(1)
    .max(3),
});

export type SchemeSummaryLlmResult = z.infer<typeof schemeSummaryLlmSchema>;

export const schemeSummaryJsonSchema = toStrictJsonSchema(schemeSummaryLlmSchema);
