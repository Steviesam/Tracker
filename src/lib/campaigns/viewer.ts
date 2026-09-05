// SECURITY REVIEW REQUIRED — AI-generated change to security-critical code
/**
 * Turns a request into a viewer, with its role read from the database.
 *
 * Every campaign route needs the same two facts — who is asking, and whether they may see
 * money — and getting the second one from the session cookie would be wrong: the cookie is
 * minted at login and would keep claiming OWNER for twelve hours after the role was taken
 * away. One primary-key lookup per request buys an immediate demotion.
 */

import { NextResponse } from "next/server";
import { canRunTheFloor, OWNER, roleOf } from "@/lib/access";
import type { Viewer } from "@/lib/campaigns/visibility";
import { requireSession } from "@/lib/session";
import type { SessionPayload } from "@/lib/auth";

export async function requireViewer(): Promise<
  | { session: SessionPayload; viewer: Viewer; response?: never }
  | { session?: never; viewer?: never; response: NextResponse }
> {
  const auth = await requireSession();
  if (auth.response) return { response: auth.response };

  const role = await roleOf(auth.session.uid);
  if (!role) {
    return { response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  }

  return {
    session: auth.session,
    viewer: {
      id: auth.session.uid,
      role,
      canSeeMoney: role === OWNER,
      canRunTheFloor: canRunTheFloor(role),
    },
  };
}

/** The one sentence every refusal about money should use. */
export const MONEY_DENIED = "Only an owner can see or change what a campaign pays.";

export function denyMoney(): NextResponse {
  return NextResponse.json({ error: MONEY_DENIED }, { status: 403 });
}

/** The refusal for work that belongs to someone else. */
export const FLOOR_DENIED = "Only an owner or an operations manager can do that.";

export function denyFloor(): NextResponse {
  return NextResponse.json({ error: FLOOR_DENIED }, { status: 403 });
}
