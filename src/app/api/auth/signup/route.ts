import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { decideSignup } from "@/lib/access";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { firstIssue, signupSchema } from "@/lib/credentials";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const BCRYPT_COST = 12;

// SECURITY REVIEW REQUIRED — AI-generated change to security-critical code
export async function POST(request: Request) {
  // Even invite-only, cap attempts per IP: the invite check is a database read, and the
  // error it returns is a probe for which addresses are on the list.
  const limit = await rateLimit(`signup:${clientIp(request)}`, 5, 60 * 60 * 1000);
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

  let decision;
  try {
    decision = await decideSignup(input.email);
  } catch (error) {
    console.error("Signup access check failed", error);
    return NextResponse.json(
      { error: "Sign-up is unavailable — this deployment is misconfigured. Open /api/health." },
      { status: 503 },
    );
  }

  if (!decision.allowed) {
    return NextResponse.json({ error: decision.reason }, { status: 403 });
  }

  // Hashing is deliberately after the access check: bcrypt at cost 12 is expensive, and
  // doing it for every uninvited attempt would make signup a way to burn the deployment's
  // CPU. The timing difference reveals only whether an address is invited, which the reply
  // already says.
  const passwordHash = await hash(input.password, BCRYPT_COST);

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash, role: decision.role },
        select: { id: true, email: true, name: true },
      });
      // Marks the invite used, or records the owner's own address so the access list is a
      // complete picture of who can get in rather than only of later arrivals.
      await tx.invite.upsert({
        where: { email: input.email },
        create: { email: input.email, acceptedAt: new Date() },
        update: { acceptedAt: new Date() },
      });
      return created;
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
    // Anything else is the deployment, not the input: an unreachable database, or tables
    // that were never migrated.
    console.error("Signup failed", error);
    return NextResponse.json(
      { error: "Sign-up is unavailable — this deployment is misconfigured. Open /api/health." },
      { status: 503 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(user), sessionCookieOptions());
  return response;
}
