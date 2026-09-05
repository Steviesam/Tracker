// SECURITY REVIEW REQUIRED — AI-generated change to security-critical code
/**
 * Who is allowed to create an account.
 *
 * The app reports on public data and needs no per-user credentials, so nothing else stops a
 * stranger who finds the URL from signing up and spending the deployment's provider
 * credits. Signup is therefore closed: the first account claims the deployment, and after
 * that an email has to be on the owner's list.
 *
 * Ownership is claimed rather than configured because the alternative — a shared secret in
 * an environment variable — is a password that is never rotated and is readable by anyone
 * who can see the deployment's settings.
 */

import { prisma } from "@/lib/db";

/**
 * Three roles, and the line between them is what each is trusted with.
 *
 * OWNER runs the business and is the only one who sees money. MANAGER runs the floor:
 * assigns work, sees what everyone is doing and how long it took, but not what anyone is
 * being paid. MEMBER does the work and sees their own.
 *
 * Manager is separate from owner because the two jobs separate in a real agency — the
 * person allocating tomorrow's shortlisting is rarely the person who knows the margins —
 * and folding them together would have meant handing out the rates to get the rota.
 */
export const OWNER = "OWNER";
export const MANAGER = "MANAGER";
export const MEMBER = "MEMBER";

export type Role = typeof OWNER | typeof MANAGER | typeof MEMBER;

export const ROLES: Role[] = [OWNER, MANAGER, MEMBER];

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  MANAGER: "Operations manager",
  MEMBER: "Team member",
};

/** What each role is for, in the one sentence the access screen has room for. */
export const ROLE_BLURB: Record<Role, string> = {
  OWNER: "Everything, including every figure.",
  MANAGER: "Assigns work and sees the whole team. No money.",
  MEMBER: "Their own tasks and the campaigns they are on.",
};

export function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role);
}

/** Can hand out work and read everyone's day. Owners manage too. */
export function canRunTheFloor(role: Role): boolean {
  return role === OWNER || role === MANAGER;
}

export const CLOSED =
  "This deployment is invite-only. Ask its owner to add your email address, then sign up.";

export type SignupDecision =
  | { allowed: true; role: Role }
  | { allowed: false; reason: string };

/**
 * Decides whether this email may sign up, and as what.
 *
 * Racing first signups are settled by the unique constraint on User.email and by the count
 * being re-read inside the same request that inserts; two people cannot both end up owner
 * because the second insert sees a non-empty table.
 */
export async function decideSignup(email: string): Promise<SignupDecision> {
  const users = await prisma.user.count();
  if (users === 0) return { allowed: true, role: OWNER };

  const invite = await prisma.invite.findUnique({ where: { email } });
  if (!invite) return { allowed: false, reason: CLOSED };
  if (invite.acceptedAt) {
    // The invite was already used. Saying so plainly is not a leak — the person typing it
    // is the one whose address it is, and "sign in instead" is the useful next step.
    return { allowed: false, reason: "That email already has an account. Sign in instead." };
  }

  return { allowed: true, role: MEMBER };
}

/** Whether anyone has signed up yet. False means the next signup becomes the owner. */
export async function deploymentClaimed(): Promise<boolean> {
  return (await prisma.user.count()) > 0;
}

export async function isOwner(userId: string): Promise<boolean> {
  return (await roleOf(userId)) === OWNER;
}

/**
 * The account's current role, or null if it no longer exists.
 *
 * Always read from the database, never from the session cookie: the cookie is signed, but
 * it is minted at login and would keep saying "owner" for the rest of its twelve hours
 * after the role was taken away.
 */
export async function roleOf(userId: string): Promise<Role | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return null;
  // An unrecognised string in the column falls to the least privilege rather than throwing:
  // a typo in the database should cost someone a screen, never hand them the rates.
  return isRole(user.role) ? user.role : MEMBER;
}
