import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { intakeSessions, type CitizenInputProfile } from "../../db/schema";

const SESSION_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24h

export type IntakeSessionStatus =
  | "in_progress"
  | "matched"
  | "no_match"
  | "abandoned";

export const findOrCreateActiveSession = async (
  channelId: string,
  userId?: string,
) => {
  const existing = await db.query.intakeSessions.findFirst({
    where: and(
      eq(intakeSessions.channelId, channelId),
      eq(intakeSessions.status, "in_progress"),
    ),
  });

  const isStale =
    existing &&
    Date.now() - existing.lastMessageAt.getTime() > SESSION_IDLE_TIMEOUT_MS;

  if (existing && !isStale) return existing;

  if (existing && isStale) {
    await db
      .update(intakeSessions)
      .set({ status: "abandoned", updatedAt: new Date() })
      .where(eq(intakeSessions.id, existing.id));
  }

  const [created] = await db
    .insert(intakeSessions)
    .values({ channelId, userId: userId ?? null })
    .returning();

  return created;
};

export const updateSession = async (
  id: string,
  data: Partial<{
    profile: Partial<CitizenInputProfile>;
    missingFields: string[];
    detectedLanguage: string | null;
    status: IntakeSessionStatus;
    turnCount: number;
  }>,
) => {
  await db
    .update(intakeSessions)
    .set({ ...data, lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(intakeSessions.id, id));
};
