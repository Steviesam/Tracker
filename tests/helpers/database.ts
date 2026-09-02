import { prisma } from "@/lib/db";

/**
 * Whether the tests can talk to Postgres.
 *
 * Most of the suite is pure functions and needs nothing running. The few things that are
 * only meaningful against a real database — the rate limiter's shared counter, the signup
 * gate — skip instead of failing, so a checkout with no Docker still gets a green run.
 */
export async function databaseReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
