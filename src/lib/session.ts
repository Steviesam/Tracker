import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken, type SessionPayload } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function currentSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/**
 * Route-handler guard: returns the session, or a 401 response to return directly.
 *
 * The cookie is signed but stateless, so on its own it stays valid for its full twelve
 * hours after the account behind it is removed — revoking someone's access would not take
 * effect until the next day. One primary-key lookup makes removal immediate.
 */
export async function requireSession(): Promise<
  { session: SessionPayload; response?: never } | { session?: never; response: NextResponse }
> {
  const session = await currentSession();
  if (!session) {
    return { response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  }

  const stillExists = await prisma.user.findUnique({
    where: { id: session.uid },
    select: { id: true },
  });
  if (!stillExists) {
    return { response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  }

  return { session };
}
