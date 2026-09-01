import { NextResponse } from "next/server";
import { fetchCreatorStats, fetchStatsFor } from "@/lib/creators";
import { resolveCreatorInput, type CreatorRef } from "@/lib/creators/resolve";
import { fetchAllMetrics } from "@/lib/metrics";
import { parseSocialUrl } from "@/lib/detect";
import { requireSession } from "@/lib/session";
import { getSession, setCreatorStats } from "@/lib/store";
import type { DetectedLink } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/** One paste should not be able to start an unbounded number of billed lookups. */
const MAX_CREATORS = 25;

/**
 * Turns post and video links into the accounts that published them.
 *
 * Neither platform puts the owner in the URL of a bare /reel/{code} or /watch?v={id}, so
 * the only way to learn it is to ask a provider — the same call the metrics table makes,
 * reused here rather than duplicated.
 */
async function ownersOf(urls: string[]): Promise<{ refs: CreatorRef[]; unresolved: string[] }> {
  const links: DetectedLink[] = [];
  for (const url of urls) {
    const parsed = parseSocialUrl(url);
    if (!parsed) continue;
    links.push({
      id: parsed.canonicalUrl,
      platform: parsed.platform,
      originalUrl: url,
      canonicalUrl: parsed.canonicalUrl,
      externalId: parsed.externalId,
      contentType: parsed.contentType,
      creatorHint: parsed.creatorHint,
      source: "paste",
      sheet: null,
      row: null,
    });
  }

  if (links.length === 0) return { refs: [], unresolved: [] };

  const results = await fetchAllMetrics(links);
  const refs: CreatorRef[] = [];
  const unresolved: string[] = [];

  for (const result of results) {
    if (result.creatorId) refs.push({ platform: result.platform, creatorId: result.creatorId });
    else unresolved.push(result.originalUrl);
  }

  return { refs, unresolved };
}

/**
 * Account-level stats, either for every creator in the current results or for accounts
 * named in the request.
 *
 * Separate from /api/process because it costs an extra provider call per creator, so it
 * only runs when the user asks for it.
 */
export async function POST(request: Request) {
  const auth = await requireSession();
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const text = typeof (body as { text?: unknown })?.text === "string" ? (body as { text: string }).text : "";

  if (text.trim().length === 0) {
    const data = await getSession(auth.session.sid);
    if (!data || data.results.length === 0) {
      return NextResponse.json({ error: "Process some links first." }, { status: 400 });
    }
    const stats = await fetchCreatorStats(data.results);
    await setCreatorStats(auth.session.sid, stats);
    const stored = await getSession(auth.session.sid);
    return NextResponse.json({ creatorStats: stored?.creatorStats ?? {} });
  }

  const { refs, contentUrls, rejected } = resolveCreatorInput(text);
  const owners = await ownersOf(contentUrls);
  const wanted = [...refs, ...owners.refs].slice(0, MAX_CREATORS);

  if (wanted.length === 0) {
    return NextResponse.json(
      {
        error:
          rejected.length > 0
            ? `Could not read an account from: ${rejected.slice(0, 3).join(", ")}. Paste a profile link, an @handle, or a reel link.`
            : "No account could be read from that. Paste a profile link, an @handle, or a reel link.",
      },
      { status: 400 },
    );
  }

  const stats = await fetchStatsFor(wanted);
  await setCreatorStats(auth.session.sid, stats);
  const stored = await getSession(auth.session.sid);

  const skipped = [...rejected, ...owners.unresolved];
  return NextResponse.json({
    creatorStats: stored?.creatorStats ?? stats,
    // Named rather than counted: knowing which line was dropped is what lets it be fixed.
    skipped: skipped.slice(0, 5),
    truncated: refs.length + owners.refs.length > MAX_CREATORS ? MAX_CREATORS : null,
  });
}
