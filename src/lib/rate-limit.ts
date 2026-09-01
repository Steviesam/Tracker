// SECURITY REVIEW REQUIRED — AI-generated change to security-critical code
/**
 * Fixed-window rate limiter for the auth endpoints.
 *
 * Signup is open to anyone, so without this a script could brute-force passwords or create
 * unlimited accounts. In-process only: it protects a single instance. Behind a load
 * balancer or multiple replicas, move this to Redis or enforce it at the edge.
 */

type Window = { count: number; resetAt: number };

const globalForLimiter = globalThis as unknown as { __smtRateLimit?: Map<string, Window> };
const windows: Map<string, Window> = (globalForLimiter.__smtRateLimit ??= new Map());

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the window resets; surfaced to the client as Retry-After. */
  retryAfter: number;
};

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  // Opportunistic cleanup so the map cannot grow without bound.
  if (windows.size > 5000) {
    for (const [entryKey, entry] of windows) {
      if (entry.resetAt < now) windows.delete(entryKey);
    }
  }

  const existing = windows.get(key);
  if (!existing || existing.resetAt < now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { allowed: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
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
