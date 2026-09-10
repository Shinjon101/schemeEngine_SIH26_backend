import { z } from "zod";

export const reportOutcomeSchema = z.object({
  partnerId: z.string().uuid(),
  schemeId: z.string().uuid(),
  applicationId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  outcome: z.enum(["received_loan", "not_received", "still_pending"]),
});

export type ReportOutcomeInput = z.infer<typeof reportOutcomeSchema>;
