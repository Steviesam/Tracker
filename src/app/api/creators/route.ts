import { NextResponse } from "next/server";
import { fetchCreatorStats } from "@/lib/creators";
import { requireSession } from "@/lib/session";
import { getSession, setCreatorStats } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Fetches account-level stats for every distinct creator in the current results.
 *
 * Separate from /api/process because it costs an extra provider call per creator, so it
 * only runs when the user asks for it.
 */
export async function POST() {
  const auth = await requireSession();
  if (auth.response) return auth.response;

  const data = await getSession(auth.session.sid);
  if (!data || data.results.length === 0) {
    return NextResponse.json({ error: "Process some links first." }, { status: 400 });
  }

  const stats = await fetchCreatorStats(data.results);
  await setCreatorStats(auth.session.sid, stats);
  const stored = await getSession(auth.session.sid);

  return NextResponse.json({ creatorStats: stored?.creatorStats ?? {} });
}
