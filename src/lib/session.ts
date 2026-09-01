import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken, type SessionPayload } from "@/lib/auth";

export async function currentSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** Route-handler guard: returns the session, or a 401 response to return directly. */
export async function requireSession(): Promise<
  { session: SessionPayload; response?: never } | { session?: never; response: NextResponse }
> {
  const session = await currentSession();
  if (!session) {
    return { response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  }
  return { session };
}
