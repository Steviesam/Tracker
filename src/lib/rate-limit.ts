// SECURITY REVIEW REQUIRED — AI-generated change to security-critical code
/**
 * Fixed-window rate limiter for the auth endpoints, counted in Postgres.
 *
 * An in-process counter is close to useless on a serverless host: each instance keeps its
 * own map, so "five signups an hour" becomes five per instance per hour, and a password
 * guesser is spread across instances by the platform's own load balancing. Counting in the
 * database the app already depends on makes the limit mean one thing for the deployment.
 *
 * The increment is a single upsert-and-return statement so two simultaneous requests cannot
 * both read the same count and write it back.
 */

import { prisma } from "@/lib/db";

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the window resets; surfaced to the client as Retry-After. */
  retryAfter: number;
};

const ALLOWED: RateLimitResult = { allowed: true, retryAfter: 0 };

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);

  let row: { count: number; resetAt: Date };

  try {
    // One statement: insert the window, or bump it — restarting the count when the previous
    // window has already passed. RETURNING gives the post-increment state, so the decision
    // below is made on the value this request actually took.
    const rows = await prisma.$queryRaw<Array<{ count: number; resetAt: Date }>>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN ${resetAt} ELSE "RateLimit"."resetAt" END
      RETURNING "count", "resetAt"
    `;
    if (!rows[0]) return ALLOWED;
    row = rows[0];
  } catch (error) {
    // A limiter that fails closed would lock everyone out of a working app the moment the
    // database hiccups. The endpoints it guards have their own protection — bcrypt on
    // login, a unique email on signup — so failing open is the lesser harm, but it is loud.
    console.error("Rate limit check failed; allowing the request", error);
    return ALLOWED;
  }

  if (row.count <= limit) return ALLOWED;

  return {
    allowed: false,
    retryAfter: Math.max(1, Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000)),
  };
}

/** Drops windows that have already expired. Cheap, and keeps the table from growing. */
export async function evictExpiredLimits() {
  await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: new Date() } } });
}

/**
 * Best-effort client IP; falls back to a constant so the limit still applies.
 *
 * `x-forwarded-for` is client-supplied and can be spoofed, so an attacker who reaches the
 * app directly can rotate it to sidestep the limit. Only deploy behind a proxy that
 * overwrites this header (and enforce a limit at that proxy too).
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
