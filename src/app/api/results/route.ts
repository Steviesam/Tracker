import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { getSession } from "@/lib/store";

export const runtime = "nodejs";

/** Restores whatever this session already has, so a page reload keeps the results. */
export async function GET() {
  const auth = await requireSession();
  if (auth.response) return auth.response;

  const data = await getSession(auth.session.sid);
  if (!data) {
    return NextResponse.json({ summary: null, results: [], creatorStats: {}, lastRefreshedAt: null });
  }

  return NextResponse.json({
    summary: data.summary,
    results: data.results,
    creatorStats: data.creatorStats,
    lastRefreshedAt: data.lastRefreshedAt,
  });
}
