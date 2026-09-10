import { z } from "zod";

export const citizenLocationSchema = z.object({
  citizenLat: z.number().min(-90).max(90),
  citizenLng: z.number().min(-180).max(180),
  limit: z.number().int().positive().max(20).optional().default(5),
});

export type CitizenLocation = z.infer<typeof citizenLocationSchema>;

export const partnerStatusReportSchema = z.object({
  acceptingApplications: z.boolean(),
  utilizedAmount: z.number().nonnegative().optional(),
});

export type PartnerStatusReport = z.infer<typeof partnerStatusReportSchema>;

export const assignSchemeSchema = z.object({
  partnerId: z.string().uuid(),
  schemeId: z.string().uuid(),
  totalQuotaAmount: z.number().positive(),
});

export type AssignSchemeInput = z.infer<typeof assignSchemeSchema>;
