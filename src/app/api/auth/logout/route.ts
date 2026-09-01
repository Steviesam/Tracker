import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { currentSession } from "@/lib/session";
import { clearSession } from "@/lib/store";

export const runtime = "nodejs";

export async function POST() {
  const session = await currentSession();
  if (session) await clearSession(session.sid);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
