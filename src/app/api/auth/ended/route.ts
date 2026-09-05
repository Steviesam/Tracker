import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Throws away a cookie that names an account which no longer exists, then puts the person
 * on the login page.
 *
 * The dashboard cannot do this itself. It is a server component, and a redirect from one
 * straight to /login would bounce: the middleware only reads the cookie's signature, sees a
 * session that still verifies, and sends them back to /dashboard — which finds the account
 * gone and redirects again, forever. Sending them through here breaks the ring, because the
 * cookie is gone by the time the middleware next looks at it.
 *
 * It lives under /api on purpose; the middleware does not watch that path.
 */
export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
