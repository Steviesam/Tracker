// SECURITY REVIEW REQUIRED — AI-generated change to security-critical code
import { NextResponse } from "next/server";
import { z } from "zod";
import { isOwner, MEMBER, OWNER } from "@/lib/access";
import { emailSchema, firstIssue } from "@/lib/credentials";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The owner's list of who may sign up.
 *
 * Every handler re-reads the caller's role from the database rather than trusting the
 * session cookie: the cookie is signed, but it is minted at login and would still say
 * "owner" after the role was taken away.
 */
async function requireOwner() {
  const auth = await requireSession();
  if (auth.response) return { response: auth.response };

  if (!(await isOwner(auth.session.uid))) {
    // 404 rather than 403: to anyone who is not the owner, this endpoint does not exist.
    return { response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { session: auth.session };
}

export async function GET() {
  const auth = await requireOwner();
  if (auth.response) return auth.response;

  const invites = await prisma.invite.findMany({
    orderBy: [{ acceptedAt: "asc" }, { createdAt: "desc" }],
    select: { id: true, email: true, acceptedAt: true, createdAt: true },
  });

  // Roles live on User, not Invite, and there can be more than one owner. Sending them
  // means the list can say who else is in charge, rather than only marking the reader.
  const owners = new Set(
    (await prisma.user.findMany({ where: { role: OWNER }, select: { email: true } })).map(
      (user) => user.email,
    ),
  );

  return NextResponse.json({
    invites: invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      isOwner: owners.has(invite.email),
      acceptedAt: invite.acceptedAt?.toISOString() ?? null,
      createdAt: invite.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireOwner();
  if (auth.response) return auth.response;

  let email: string;
  try {
    email = z.object({ email: emailSchema }).parse(await request.json()).email;
  } catch (error) {
    const message =
      error instanceof z.ZodError ? firstIssue(error) : "Enter a valid email address.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const existing = await prisma.invite.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: existing.acceptedAt ? "That email already has an account." : "That email is already invited." },
      { status: 409 },
    );
  }

  await prisma.invite.create({ data: { email, invitedById: auth.session.uid } });
  return NextResponse.json({ ok: true });
}

/**
 * Promote a member to owner, or demote one back.
 *
 * An owner can hand out access to everything, so the only guard that matters is that a
 * deployment cannot end up with nobody in charge: nobody may change their own role. That
 * one rule makes lockout impossible without needing to count the remaining owners, and it
 * means handing over control is always a two-person act.
 */
export async function PATCH(request: Request) {
  const auth = await requireOwner();
  if (auth.response) return auth.response;

  let input;
  try {
    input = z
      .object({ email: emailSchema, role: z.enum([OWNER, MEMBER]) })
      .parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? firstIssue(error) : "Check the details sent.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (input.email === auth.session.email) {
    return NextResponse.json(
      { error: "You cannot change your own role. Ask another owner." },
      { status: 400 },
    );
  }

  // Only an account can hold a role. An invite that nobody has taken up yet is just an
  // address, so there is nothing to promote until they have signed up.
  const updated = await prisma.user.updateMany({
    where: { email: input.email },
    data: { role: input.role },
  });
  if (updated.count === 0) {
    return NextResponse.json(
      { error: "That person has not signed up yet, so there is no account to promote." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireOwner();
  if (auth.response) return auth.response;

  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Which email?" }, { status: 400 });

  if (email === auth.session.email) {
    return NextResponse.json({ error: "You cannot remove your own access." }, { status: 400 });
  }

  // An owner is not removable through here by another owner. Silently keeping the account
  // while deleting its invite would leave the list saying someone is gone who can still
  // sign in, so this refuses instead. Demoting them first is a deliberate, separate act.
  const target = await prisma.user.findUnique({ where: { email }, select: { role: true } });
  if (target?.role === OWNER) {
    return NextResponse.json(
      { error: "That account is an owner. Make it a member first, then remove it." },
      { status: 400 },
    );
  }

  // Removing an invite that was used also removes the account, otherwise "revoked" would
  // only mean "cannot sign up again" while the person stays signed in and can still log in.
  await prisma.$transaction([
    prisma.user.deleteMany({ where: { email } }),
    prisma.invite.deleteMany({ where: { email } }),
  ]);

  return NextResponse.json({ ok: true });
}
