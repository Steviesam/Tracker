import { runActor, type ApifyItem } from "@/lib/apify";
import { apifyConfig } from "@/lib/env";
import { emptyStats, summarise, type CreatorStatsProvider, type CreatorVideo } from "@/lib/creators/types";
import { toNumber } from "@/lib/providers/types";
import { CREATOR_SAMPLE_SIZE, type CreatorStats } from "@/lib/types";

/**
 * Instagram account stats from the third-party public-data provider.
 *
 * Meta's official APIs cannot supply this for creators you do not own: Business Discovery
 * needs Advanced Access, and even then returns no follower count for arbitrary accounts.
 *
 * Two actor calls are needed per creator — one for the recent reels, one for the follower
 * count — so this runs on demand rather than with every link.
 */

const NAME = "apify:instagram-creator";

const NOT_CONFIGURED =
  "Instagram creator stats are not configured. Set APIFY_TOKEN and APIFY_INSTAGRAM_REELS_ACTOR.";

/** Reads the reels actor output. See public-data.ts for why plays are used as "views". */
function toVideo(item: ApifyItem): CreatorVideo {
  return {
    views: toNumber(item.videoPlayCount) ?? toNumber(item.videoViewCount) ?? toNumber(item.playCount),
    likes: toNumber(item.likesCount),
    comments: toNumber(item.commentsCount),
  };
}

/** Follower count comes from a separate profile actor; absent means no engagement rate. */
async function loadFollowers(
  actorId: string | undefined,
  token: string,
  username: string,
): Promise<{ followers: number | null; displayName: string | null; note: string | null }> {
  if (!actorId) {
    return {
      followers: null,
      displayName: null,
      note: "Set APIFY_INSTAGRAM_PROFILE_ACTOR to get follower counts and engagement rate.",
    };
  }

  try {
    const items = await runActor(actorId, token, { usernames: [username] });
    const profile = items[0];
    if (!profile) return { followers: null, displayName: null, note: "Profile not found." };
    return {
      followers: toNumber(profile.followersCount),
      displayName: typeof profile.fullName === "string" ? profile.fullName : null,
      note: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "profile lookup failed";
    return { followers: null, displayName: null, note: `Follower lookup failed (${message}).` };
  }
}

export const instagramCreatorProvider: CreatorStatsProvider = {
  name: NAME,

  isConfigured() {
    const config = apifyConfig();
    return Boolean(config?.instagramReelsActor);
  },

  async fetch(creatorIds: string[]): Promise<Map<string, CreatorStats>> {
    const results = new Map<string, CreatorStats>();
    const config = apifyConfig();
    const reelsActor = config?.instagramReelsActor;

    if (!config || !reelsActor) {
      for (const id of creatorIds) {
        results.set(id, emptyStats("INSTAGRAM", id, "unavailable", NOT_CONFIGURED, NAME));
      }
      return results;
    }

    // The reels actor is queried one username at a time so a single private or renamed
    // account cannot take down the whole batch.
    await Promise.all(
      creatorIds.map(async (id) => {
        const username = id.replace(/^@/, "");
        try {
          const [items, profile] = await Promise.all([
            runActor(reelsActor, config.token, {
              username: [username],
              resultsLimit: CREATOR_SAMPLE_SIZE,
            }),
            loadFollowers(config.instagramProfileActor, config.token, username),
          ]);

          const videos = items
            .filter((item) => !item.error)
            .slice(0, CREATOR_SAMPLE_SIZE)
            .map(toVideo);

          results.set(
            id,
            summarise("INSTAGRAM", id, videos, {
              displayName: profile.displayName,
              profileUrl: `https://www.instagram.com/${username}/`,
              followers: profile.followers,
              provider: NAME,
              note: profile.note,
            }),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "request failed";
          results.set(
            id,
            emptyStats("INSTAGRAM", id, "error", `Instagram creator stats failed: ${message}`, NAME),
          );
        }
      }),
    );

    return results;
  },
};
