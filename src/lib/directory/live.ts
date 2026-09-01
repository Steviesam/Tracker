/**
 * Replaces a directory creator's uploaded follower count with the one Instagram shows now.
 *
 * A maintained sheet holds whatever was true the day someone typed it, usually rounded to
 * `309k`. That is close enough to filter on and wrong on a profile card, where the user is
 * comparing against the real number on Instagram. So the count is refreshed on demand,
 * per creator, rather than for the whole directory: the lookup is a billed actor call, and
 * a 5,000-row sheet would be 5,000 of them.
 */

import { runActor } from "@/lib/apify";
import { prisma } from "@/lib/db";
import { apifyConfig } from "@/lib/env";
import { MAX_REFRESH, type LiveFollowers } from "@/lib/directory/types";
import { toNumber } from "@/lib/providers/types";

export const NOT_CONFIGURED =
  "Live follower counts need APIFY_TOKEN and APIFY_INSTAGRAM_PROFILE_ACTOR.";

export function isConfigured(): boolean {
  const config = apifyConfig();
  return Boolean(config?.instagramProfileActor);
}

function keyOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

/**
 * Looks the handles up in one actor run and writes back the ones that answered.
 *
 * A handle the actor could not read keeps its sheet number. Blanking it would turn "we did
 * not check" into "this creator has no audience", which reads the same on a card and is
 * the more expensive mistake.
 */
export async function refreshFollowers(usernames: string[]): Promise<LiveFollowers[]> {
  const wanted = [...new Set(usernames.map((name) => name.replace(/^@/, "").trim().toLowerCase()))]
    .filter(Boolean)
    .slice(0, MAX_REFRESH);

  if (wanted.length === 0) return [];

  const config = apifyConfig();
  const actor = config?.instagramProfileActor;
  if (!config || !actor) {
    return wanted.map((username) => ({
      username,
      followers: null,
      checkedAt: null,
      error: NOT_CONFIGURED,
    }));
  }

  let items;
  try {
    items = await runActor(actor, config.token, { usernames: wanted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "lookup failed";
    return wanted.map((username) => ({
      username,
      followers: null,
      checkedAt: null,
      error: `Live lookup failed (${message}).`,
    }));
  }

  const found = new Map<string, number>();
  for (const item of items) {
    const username = keyOf(item.username);
    const followers = toNumber(item.followersCount);
    if (username && followers !== null) found.set(username, followers);
  }

  const checkedAt = new Date();
  if (found.size > 0) {
    await prisma.$transaction(
      [...found].map(([username, followers]) =>
        prisma.creator.update({
          where: { username },
          data: { followers, followersSource: "live", followersCheckedAt: checkedAt },
        }),
      ),
    );
  }

  return wanted.map((username) => {
    const followers = found.get(username);
    return followers === undefined
      ? {
          username,
          followers: null,
          checkedAt: null,
          error: "Instagram returned no follower count — the account may be private or renamed.",
        }
      : { username, followers, checkedAt: checkedAt.toISOString(), error: null };
  });
}
