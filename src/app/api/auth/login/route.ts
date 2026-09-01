import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { loginSchema } from "@/lib/credentials";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * A real bcrypt hash to compare against when the email is unknown. Without this, a missing
 * user would return noticeably faster than a wrong password and leak which emails exist.
 */
const DUMMY_HASH = "$2a$12$hanI/mHGisQ3XQ1PLEa6/.XJ/emxZ.fzyC4/RM8zobnL8d2GnW3lG";

// SECURITY REVIEW REQUIRED — AI-generated change to security-critical code
export async function POST(request: Request) {
  const limit = rateLimit(`login:${clientIp(request)}`, 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let input;
  try {
    input = loginSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, name: true, passwordHash: true },
  });

  const passwordMatches = await compare(input.password, user?.passwordHash ?? DUMMY_HASH);

  // One generic message for both cases so the response cannot be used to enumerate accounts.
  if (!user || !passwordMatches) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    SESSION_COOKIE,
    await createSessionToken({ id: user.id, email: user.email, name: user.name }),
    sessionCookieOptions(),
  );
  return response;
}
