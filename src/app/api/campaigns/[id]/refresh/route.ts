import { NextResponse } from "next/server";
import { z } from "zod";
import { refreshStats } from "@/lib/campaigns/mutations";
import { findCampaign } from "@/lib/campaigns/queries";
import { creatorStatsAvailable } from "@/lib/creators";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { requireViewer } from "@/lib/campaigns/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Provider calls are slow; the default ten seconds is not enough for a row of them. */
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/** Each account is a paid provider call, so a click cannot ask for the whole directory. */
const MAX_AT_ONCE = 20;

export async function POST(request: Request, context: Context) {
  const auth = await requireViewer();
  if (auth.response) return auth.response;

  if (!creatorStatsAvailable()) {
    return NextResponse.json(
      { error: "No creator-stats provider is configured, so there is nothing to refresh from." },
      { status: 503 },
    );
  }

  // This spends money on every call, so it is capped per person as well as per click.
  const limit = await rateLimit(`campaign-refresh:${clientIp(request)}`, 20, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many refreshes. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const { id } = await context.params;

  let ids: string[];
  try {
    ids = z
      .object({ influencerIds: z.array(z.string().min(1)).min(1).max(MAX_AT_ONCE) })
      .parse(await request.json()).influencerIds;
  } catch {
    return NextResponse.json(
      { error: `Pick between 1 and ${MAX_AT_ONCE} influencers to refresh.` },
      { status: 400 },
    );
  }

  const updated = await refreshStats(ids);

  return NextResponse.json({ updated, campaign: await findCampaign(id, auth.viewer) });
}
