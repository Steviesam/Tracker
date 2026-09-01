import { instagramCreatorProvider } from "@/lib/creators/instagram";
import { emptyStats, type CreatorStatsProvider } from "@/lib/creators/types";
import { youtubeCreatorProvider } from "@/lib/creators/youtube";
import type { CreatorStats, LinkResult, Platform } from "@/lib/types";

/**
 * Account-level stats are only available where a provider can read a whole profile.
 * Facebook is absent on purpose: no actor exposes Page follower counts and recent reels
 * together reliably, and reporting a half-built engagement rate would be worse than
 * saying nothing.
 */
const PROVIDERS: Partial<Record<Platform, CreatorStatsProvider>> = {
  INSTAGRAM: instagramCreatorProvider,
  YOUTUBE: youtubeCreatorProvider,
};

const UNSUPPORTED =
  "Account-level stats are not available for Facebook — no provider exposes Page followers and recent reels together.";

export type CreatorKey = `${Platform}:${string}`;

export function creatorKey(platform: Platform, creatorId: string): CreatorKey {
  return `${platform}:${creatorId}`;
}

/** True when at least one creator-stats provider has credentials. */
export function creatorStatsAvailable(): boolean {
  return Object.values(PROVIDERS).some((provider) => provider.isConfigured());
}

/** The distinct creators worth looking up, so a batch of links costs one call each. */
export function creatorsIn(results: LinkResult[]): Array<{ platform: Platform; creatorId: string }> {
  const seen = new Map<CreatorKey, { platform: Platform; creatorId: string }>();
  for (const result of results) {
    if (!result.creatorId) continue;
    const key = creatorKey(result.platform, result.creatorId);
    if (!seen.has(key)) seen.set(key, { platform: result.platform, creatorId: result.creatorId });
  }
  return [...seen.values()];
}

/**
 * Fetches stats for every distinct creator across the given results, running the platforms
 * in parallel. Returns a map keyed by `creatorKey`.
 */
export async function fetchCreatorStats(
  results: LinkResult[],
): Promise<Record<CreatorKey, CreatorStats>> {
  const byPlatform = new Map<Platform, string[]>();
  for (const { platform, creatorId } of creatorsIn(results)) {
    const bucket = byPlatform.get(platform);
    if (bucket) bucket.push(creatorId);
    else byPlatform.set(platform, [creatorId]);
  }

  const out: Record<string, CreatorStats> = {};

  await Promise.all(
    [...byPlatform.entries()].map(async ([platform, creatorIds]) => {
      const provider = PROVIDERS[platform];

      if (!provider) {
        for (const id of creatorIds) {
          out[creatorKey(platform, id)] = emptyStats(platform, id, "unavailable", UNSUPPORTED, "none");
        }
        return;
      }

      let stats: Map<string, CreatorStats>;
      try {
        stats = await provider.fetch(creatorIds);
      } catch (error) {
        const message = error instanceof Error ? error.message : "provider failed";
        stats = new Map(
          creatorIds.map((id) => [id, emptyStats(platform, id, "error", message, provider.name)]),
        );
      }

      for (const id of creatorIds) {
        out[creatorKey(platform, id)] =
          stats.get(id) ??
          emptyStats(platform, id, "error", "No response for this creator.", provider.name);
      }
    }),
  );

  return out;
}
