/**
 * When people were here.
 *
 * The narrowest thing that answers "has the team started today" — a first sign-in, a last
 * seen, a sign-out. There is no idle timer, no screenshot, no keystroke count, and there
 * should not be: none of them would tell anyone which process is slow, which is the only
 * question this module was built to answer.
 *
 * Recorded from signing in rather than from a clock-in button, because a button is one more
 * thing to forget and forgetting it would read as not having come to work.
 */

import { istDay } from "@/lib/campaigns/dates";
import { prisma } from "@/lib/db";

/**
 * Note that this person is here.
 *
 * The first call of the day sets the arrival time; later ones only move `lastSeenAt`.
 * Signing in again after lunch does not restart the day — someone who arrived at nine
 * arrived at nine, and a row that said ten past two would be a worse record than none.
 *
 * Coming back does clear the sign-out, though. Otherwise somebody who signed out at six and
 * came back at seven would sit there all evening under a line saying they had left, which
 * is the one thing the record is supposed to get right.
 */
export async function markPresent(userId: string, at: Date = new Date()): Promise<void> {
  const day = istDay(at);
  await prisma.workDay.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, signedInAt: at, lastSeenAt: at },
    update: { lastSeenAt: at, signedOutAt: null },
  });
}

/**
 * Note that this person has signed out.
 *
 * Only touches a day that exists: signing out without ever having signed in is not a
 * working day, and inventing one from the sign-out alone would put an arrival time on the
 * record that nobody arrived at.
 */
export async function markSignedOut(userId: string, at: Date = new Date()): Promise<void> {
  const day = istDay(at);
  await prisma.workDay.updateMany({
    where: { userId, day },
    data: { signedOutAt: at, lastSeenAt: at },
  });
}

export type Presence = {
  signedInAt: Date;
  lastSeenAt: Date;
  signedOutAt: Date | null;
};

/** Today's presence for everyone who has been seen, keyed by user id. */
export async function presenceFor(
  day: string,
  userIds?: string[],
): Promise<Map<string, Presence>> {
  const rows = await prisma.workDay.findMany({
    where: { day, ...(userIds ? { userId: { in: userIds } } : {}) },
    select: { userId: true, signedInAt: true, lastSeenAt: true, signedOutAt: true },
  });

  return new Map(
    rows.map((row) => [
      row.userId,
      { signedInAt: row.signedInAt, lastSeenAt: row.lastSeenAt, signedOutAt: row.signedOutAt },
    ]),
  );
}

/**
 * How long they have been at work.
 *
 * From arrival to signing out, or to when they were last seen if they never signed out —
 * people close a laptop far more often than they press sign out, and a day left open would
 * otherwise keep growing all night.
 */
export function millisAtWork(presence: Presence | undefined): number | null {
  if (!presence) return null;
  const end = presence.signedOutAt ?? presence.lastSeenAt;
  return Math.max(0, end.getTime() - presence.signedInAt.getTime());
}
