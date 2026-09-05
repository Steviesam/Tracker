import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { currentSession } from "@/lib/session";
import { clearSession } from "@/lib/store";
import { markSignedOut } from "@/lib/tasks/attendance";

export const runtime = "nodejs";

export async function POST() {
  const session = await currentSession();
  if (session) {
    await clearSession(session.sid);
    // Closes today's working day. Most days end with a closed laptop instead, which is why
    // the day also carries a last-seen time and does not depend on this happening.
    await markSignedOut(session.uid);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
