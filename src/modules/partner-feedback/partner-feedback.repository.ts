import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { partnerOutcomeReports } from "../../db/schema";
import type { ReportOutcomeInput } from "./partner-feedback.schema";

export const recordOutcomeReport = async (data: ReportOutcomeInput) => {
  await db.insert(partnerOutcomeReports).values({
    partnerId: data.partnerId,
    schemeId: data.schemeId,
    applicationId: data.applicationId ?? null,
    userId: data.userId ?? null,
    outcome: data.outcome,
  });
};

export interface ConfidenceStats {
  successCount: number;
  totalDecisive: number; // excludes "still_pending" — not a signal either way yet
}

export const getConfidenceStatsBatch = async (
  partnerIds: string[],
  schemeId: string,
): Promise<Map<string, ConfidenceStats>> => {
  if (partnerIds.length === 0) return new Map();

  const rows = await db
    .select({
      partnerId: partnerOutcomeReports.partnerId,
      successCount: sql<number>`count(*) filter (where ${partnerOutcomeReports.outcome} = 'received_loan')`,
      totalDecisive: sql<number>`count(*) filter (where ${partnerOutcomeReports.outcome} != 'still_pending')`,
    })
    .from(partnerOutcomeReports)
    .where(
      and(
        inArray(partnerOutcomeReports.partnerId, partnerIds),
        eq(partnerOutcomeReports.schemeId, schemeId),
      ),
    )
    .groupBy(partnerOutcomeReports.partnerId);

  return new Map(
    rows.map((r) => [
      r.partnerId,
      {
        successCount: Number(r.successCount),
        totalDecisive: Number(r.totalDecisive),
      },
    ]),
  );
};
