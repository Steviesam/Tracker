import { NextResponse } from "next/server";
import { fetchAllMetrics } from "@/lib/metrics";
import { requireSession } from "@/lib/session";
import { getSession, setResults } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Fetches metrics for the links already held in this session. "Process Links" and
 * "Refresh All" both call this, which is why refreshing never needs a re-upload.
 */
export async function POST() {
  const auth = await requireSession();
  if (auth.response) return auth.response;

  const data = await getSession(auth.session.sid);
  if (!data) {
    return NextResponse.json({ error: "Upload a file or paste URLs first." }, { status: 400 });
  }
  if (data.links.length === 0) {
    return NextResponse.json(
      { error: "No supported Instagram, YouTube or Facebook links were found." },
      { status: 400 },
    );
  }

  const results = await fetchAllMetrics(data.links);
  await setResults(auth.session.sid, results);
  const stored = await getSession(auth.session.sid);

  return NextResponse.json({
    summary: data.summary,
    results,
    creatorStats: stored?.creatorStats ?? {},
    lastRefreshedAt: stored?.lastRefreshedAt ?? null,
  });
}
