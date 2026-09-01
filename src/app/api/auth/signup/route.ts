import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { firstIssue, signupSchema } from "@/lib/credentials";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const BCRYPT_COST = 12;

// SECURITY REVIEW REQUIRED — AI-generated change to security-critical code
export async function POST(request: Request) {
  // Signup is open, so cap account creation per IP.
  const limit = rateLimit(`signup:${clientIp(request)}`, 5, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many accounts created from this network. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let input;
  try {
    input = signupSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? firstIssue(error) : "Check the details you entered.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const passwordHash = await hash(input.password, BCRYPT_COST);

  let user;
  try {
    user = await prisma.user.create({
      data: { email: input.email, name: input.name, passwordHash },
      select: { id: true, email: true, name: true },
    });
  } catch (error) {
    // P2002 = unique constraint on email. Relying on the constraint rather than a
    // pre-check avoids a race between two simultaneous signups.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "An account with that email already exists. Sign in instead." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Could not create the account." }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(user), sessionCookieOptions());
  return response;
}
