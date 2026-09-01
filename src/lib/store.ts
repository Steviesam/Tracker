import { prisma } from "@/lib/db";
import type { CreatorKey } from "@/lib/creators";
import type { CreatorStats, DetectedLink, DetectionSummary, LinkResult } from "@/lib/types";

/**
 * Detected links live for the lifetime of the login session, which is what lets
 * "Refresh All" re-fetch metrics without the user uploading the file again.
 *
 * Stored in Postgres, not process memory. A Vercel deploy is many short-lived instances
 * that do not share a Map — an upload handled by one function would be invisible to the
 * next. Refresh keeps the row; logout deletes it. The creator directory is a different
 * table and outlives any one login.
 */

export type SessionData = {
  summary: DetectionSummary;
  links: DetectedLink[];
  results: LinkResult[];
  /** Populated only when the user asks for creator stats, since each costs a lookup. */
  creatorStats: Record<CreatorKey, CreatorStats>;
  lastRefreshedAt: string | null;
};

const TTL_MS = 1000 * 60 * 60 * 12;

function asData(payload: unknown): SessionData {
  return payload as SessionData;
}

async function evictExpired() {
  const cutoff = new Date(Date.now() - TTL_MS);
  await prisma.workSession.deleteMany({ where: { updatedAt: { lt: cutoff } } });
}

export async function getSession(sid: string): Promise<SessionData | null> {
  const row = await prisma.workSession.findUnique({ where: { sid } });
  if (!row) return null;
  if (row.updatedAt.getTime() < Date.now() - TTL_MS) {
    await prisma.workSession.deleteMany({ where: { sid } });
    return null;
  }
  return asData(row.payload);
}

export async function setDetection(sid: string, summary: DetectionSummary, links: DetectedLink[]) {
  const payload: SessionData = {
    summary,
    links,
    results: [],
    creatorStats: {},
    lastRefreshedAt: null,
  };
  await prisma.workSession.upsert({
    where: { sid },
    create: { sid, payload },
    update: { payload },
  });
  await evictExpired();
}

export async function setResults(sid: string, results: LinkResult[]) {
  const existing = await getSession(sid);
  if (!existing) return;
  const payload: SessionData = {
    ...existing,
    results,
    lastRefreshedAt: new Date().toISOString(),
  };
  await prisma.workSession.update({ where: { sid }, data: { payload } });
}

const EMPTY: SessionData = {
  summary: {
    sourceLabel: "Pasted accounts",
    sheets: [],
    rowsScanned: 0,
    totalUrlsFound: 0,
    duplicatesRemoved: 0,
    unsupportedSkipped: 0,
    uniqueLinks: 0,
    byPlatform: { INSTAGRAM: 0, YOUTUBE: 0, FACEBOOK: 0 },
  },
  links: [],
  results: [],
  creatorStats: {},
  lastRefreshedAt: null,
};

/**
 * Merges in newly fetched creators, keeping any already looked up in this session.
 *
 * Creates the row when there is none: accounts can be looked up by pasting them straight
 * into the engagement screen, so a session can hold creator stats without ever having
 * held a link.
 */
export async function setCreatorStats(sid: string, stats: Record<CreatorKey, CreatorStats>) {
  const existing = (await getSession(sid)) ?? EMPTY;
  const payload: SessionData = {
    ...existing,
    creatorStats: { ...existing.creatorStats, ...stats },
  };
  await prisma.workSession.upsert({
    where: { sid },
    create: { sid, payload },
    update: { payload },
  });
}

/**
 * deleteMany rather than delete: logging out without having uploaded anything is normal,
 * and `delete` treats a missing row as an error — it logged a stack trace on every such
 * logout, which makes the real errors in the log harder to see.
 */
export async function clearSession(sid: string) {
  await prisma.workSession.deleteMany({ where: { sid } });
}
