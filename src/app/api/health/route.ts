import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isConfigured as liveFollowersConfigured } from "@/lib/directory/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reported by name only. "liveFollowers: false" cannot say which of four variables is the
 * missing one, leaving no way to find out except guessing and redeploying.
 */
const OPTIONAL_VARS = [
  "YOUTUBE_API_KEY",
  "APIFY_TOKEN",
  "APIFY_INSTAGRAM_ACTOR",
  "APIFY_FACEBOOK_ACTOR",
  "APIFY_INSTAGRAM_REELS_ACTOR",
  "APIFY_INSTAGRAM_PROFILE_ACTOR",
] as const;

function presence(): Record<string, boolean> {
  return Object.fromEntries(
    OPTIONAL_VARS.map((name) => [name, Boolean(process.env[name]?.trim())]),
  );
}

/**
 * Whether this deployment is actually usable.
 *
 * A missing environment variable surfaces in the browser only as "Sign in failed", with the
 * real cause buried in the hosting platform's logs. This says which piece is wrong in one
 * request.
 *
 * It reports presence and reachability, never values: no connection string, no secret, no
 * database host. A Prisma error code is enough to name the problem without describing the
 * infrastructure to whoever asks.
 */
export async function GET() {
  const secret = process.env.APP_SESSION_SECRET ?? "";

  const config = {
    databaseUrl: Boolean(process.env.DATABASE_URL?.trim()),
    // Only the build's migration step reads this, so a missing one breaks the deploy
    // rather than the running app — but it is the same class of mistake, and this is
    // where people come looking.
    directDatabaseUrl: Boolean(process.env.DIRECT_DATABASE_URL?.trim()),
    // The app refuses anything shorter, so a too-short value is as broken as a missing one.
    sessionSecret: secret.trim().length >= 32,
    // Optional, so it is never a problem — but it is the difference between a directory
    // card showing the sheet's rounded "309k" and the count Instagram shows now.
    liveFollowers: liveFollowersConfigured(),
  };

  const database = { reachable: false, migrated: false, code: null as string | null };

  if (config.databaseUrl) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      database.reachable = true;
      // Reaching the server is not enough: the tables have to exist too.
      await prisma.user.count();
      database.migrated = true;
    } catch (error) {
      const code = (error as { code?: string }).code;
      database.code = typeof code === "string" ? code : "UNKNOWN";
      console.error("Health check: database unusable", error);
    }
  }

  const problems: string[] = [];
  if (!config.databaseUrl) problems.push("DATABASE_URL is not set.");
  if (!config.directDatabaseUrl) {
    problems.push("DIRECT_DATABASE_URL is not set; migrations cannot run on the next deploy.");
  }
  if (!config.sessionSecret) {
    problems.push("APP_SESSION_SECRET is missing or shorter than 32 characters.");
  }
  if (config.databaseUrl && !database.reachable) {
    problems.push("DATABASE_URL is set but the database refused the connection.");
  }
  if (database.reachable && !database.migrated) {
    problems.push("The database is reachable but the tables are missing; migrations did not run.");
  }

  const ok = problems.length === 0;
  return NextResponse.json(
    { ok, config, env: presence(), database, problems },
    { status: ok ? 200 : 503 },
  );
}
