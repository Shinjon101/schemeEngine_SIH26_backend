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
  declaredLanguage?: string,
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

  // Stored at creation rather than only on update, so the very first turn is
  // already answered in the citizen's language.
  const [created] = await db
    .insert(intakeSessions)
    .values({
      channelId,
      userId: userId ?? null,
      detectedLanguage: declaredLanguage ?? null,
    })
    .returning();

  return created;
};

/**
 * The most recent session on a channel, whatever its status. The
 * summarisation route uses this: by the time a citizen asks for an
 * explanation their session has usually already moved to "matched", so
 * restricting the lookup to "in_progress" would find nothing.
 */
export const findLatestSessionByChannel = async (channelId: string) =>
  db.query.intakeSessions.findFirst({
    where: eq(intakeSessions.channelId, channelId),
    orderBy: (session, { desc }) => [desc(session.lastMessageAt)],
  });

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
