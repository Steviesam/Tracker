import { NextResponse } from "next/server";
import { denyFloor, requireViewer } from "@/lib/campaigns/viewer";
import { INSIGHT_DAYS, insights, teamToday } from "@/lib/tasks/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the whole team is doing today, and where the time has been going.
 *
 * Manager and owner only, and refused at the door rather than filtered afterwards: the two
 * halves of this answer are the counts for people other than the person asking, and there
 * is no version of it that is safe to send to somebody who should not have it.
 */
export async function GET(request: Request) {
  const auth = await requireViewer();
  if (auth.response) return auth.response;
  if (!auth.viewer.canRunTheFloor) return denyFloor();

  const requested = Number(new URL(request.url).searchParams.get("days"));
  const days = Number.isFinite(requested) && requested >= 1 && requested <= 90
    ? Math.round(requested)
    : INSIGHT_DAYS;

  const [today, where] = await Promise.all([teamToday(), insights(days)]);

  return NextResponse.json({ today, insights: where, days });
}
