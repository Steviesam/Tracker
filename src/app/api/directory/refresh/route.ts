import { NextResponse, type NextRequest } from "next/server";
import { refreshFollowers } from "@/lib/directory/live";
import { MAX_REFRESH } from "@/lib/directory/types";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Refreshes follower counts for the handles given, straight from Instagram.
 *
 * Rate limited because every call is billed by the actor, and a stuck retry loop in the
 * browser would otherwise spend real money quietly.
 */
export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if (auth.response) return auth.response;

  const limit = rateLimit(`directory-refresh:${clientIp(request)}`, 40, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many refreshes. Try again in ${limit.retryAfter} seconds.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const usernames = (body as { usernames?: unknown })?.usernames;
  if (!Array.isArray(usernames) || usernames.some((name) => typeof name !== "string")) {
    return NextResponse.json({ error: "Expected `usernames` as a list." }, { status: 400 });
  }
  if (usernames.length === 0) {
    return NextResponse.json({ error: "Pick at least one creator." }, { status: 400 });
  }
  if (usernames.length > MAX_REFRESH) {
    return NextResponse.json(
      { error: `Refresh at most ${MAX_REFRESH} creators at a time.` },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({ results: await refreshFollowers(usernames as string[]) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refresh failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
