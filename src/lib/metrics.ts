import { facebookProvider } from "@/lib/providers/facebook";
import { instagramProvider } from "@/lib/providers/instagram";
import {
  facebookPublicDataProvider,
  instagramPublicDataProvider,
} from "@/lib/providers/public-data";
import {
  errored,
  unavailable,
  type MetricsProvider,
  type ProviderOutcome,
} from "@/lib/providers/types";
import { youtubeProvider } from "@/lib/providers/youtube";
import { PLATFORMS, type DetectedLink, type LinkResult, type Platform } from "@/lib/types";

/**
 * Provider preference per platform, most authoritative first.
 *
 * Official APIs are tried before the third-party provider, and the third-party provider is
 * only reached when it is actually configured. YouTube has no fallback because its official
 * API already covers arbitrary public videos.
 */
const PROVIDER_CHAIN: Record<Platform, MetricsProvider[]> = {
  YOUTUBE: [youtubeProvider],
  INSTAGRAM: [instagramProvider, instagramPublicDataProvider],
  FACEBOOK: [facebookProvider, facebookPublicDataProvider],
};

/** Tells the user exactly what to configure, rather than just that something is missing. */
const NOT_CONFIGURED: Record<Platform, string> = {
  YOUTUBE: "No YouTube provider configured. Set YOUTUBE_API_KEY to read public video metrics.",
  INSTAGRAM:
    "No Instagram provider configured. Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID for official Business Discovery (public professional accounts only), or APIFY_TOKEN and APIFY_INSTAGRAM_ACTOR for arbitrary public URLs.",
  FACEBOOK:
    "No Facebook provider configured. Facebook's official API only reports on Pages you manage, so arbitrary public URLs need APIFY_TOKEN and APIFY_FACEBOOK_ACTOR.",
};

export type PlatformReadiness = {
  platform: Platform;
  configured: boolean;
  providers: string[];
};

/** Lets the UI warn up front which platforms will return N/A for everything. */
export function providerReadiness(): PlatformReadiness[] {
  return PLATFORMS.map((platform) => {
    const active = PROVIDER_CHAIN[platform].filter((provider) => provider.isConfigured());
    return {
      platform,
      configured: active.length > 0,
      providers: active.map((provider) => provider.name),
    };
  });
}

/** True when a row still has no usable metric, so the next provider is worth trying. */
function isEmpty(outcome: ProviderOutcome): boolean {
  const { views, likes, comments, shares } = outcome.metrics;
  return views === null && likes === null && comments === null && shares === null;
}

async function fetchForPlatform(
  platform: Platform,
  links: DetectedLink[],
): Promise<Map<string, ProviderOutcome>> {
  const outcomes = new Map<string, ProviderOutcome>();
  let pending = links;

  for (const provider of PROVIDER_CHAIN[platform]) {
    if (pending.length === 0) break;
    if (!provider.isConfigured()) continue;

    let batch: Map<string, ProviderOutcome>;
    try {
      batch = await provider.fetch(pending);
    } catch (error) {
      const message = error instanceof Error ? error.message : "provider failed";
      batch = new Map(pending.map((link) => [link.id, errored(message, provider.name)]));
    }

    const stillPending: DetectedLink[] = [];
    for (const link of pending) {
      const outcome = batch.get(link.id);
      if (!outcome) {
        stillPending.push(link);
        continue;
      }
      // Keep the best answer seen so far, but let a later provider improve on an empty one.
      const existing = outcomes.get(link.id);
      if (!existing || isEmpty(existing)) outcomes.set(link.id, outcome);
      if (isEmpty(outcome)) stillPending.push(link);
    }
    pending = stillPending;
  }

  // No provider configured for this platform at all.
  for (const link of links) {
    if (!outcomes.has(link.id)) {
      outcomes.set(link.id, unavailable(NOT_CONFIGURED[platform], "none"));
    }
  }

  return outcomes;
}

/** Fetches metrics for every detected link, running the platforms in parallel. */
export async function fetchAllMetrics(links: DetectedLink[]): Promise<LinkResult[]> {
  const fetchedAt = new Date().toISOString();

  const byPlatform = new Map<Platform, DetectedLink[]>();
  for (const link of links) {
    const bucket = byPlatform.get(link.platform);
    if (bucket) bucket.push(link);
    else byPlatform.set(link.platform, [link]);
  }

  const merged = new Map<string, ProviderOutcome>();
  await Promise.all(
    [...byPlatform.entries()].map(async ([platform, platformLinks]) => {
      const outcomes = await fetchForPlatform(platform, platformLinks);
      for (const [id, outcome] of outcomes) merged.set(id, outcome);
    }),
  );

  return links.map((link) => {
    const outcome = merged.get(link.id) ?? errored("No response for this link.", "none");
    return {
      ...link,
      creator: outcome.creator ?? link.creatorHint,
      // Instagram links carry a usable handle even when no provider answered.
      creatorId:
        outcome.creatorId ?? (link.platform === "INSTAGRAM" ? link.creatorHint : null),
      title: outcome.title,
      postedAt: outcome.postedAt,
      metrics: outcome.metrics,
      status: outcome.status,
      note: outcome.note,
      provider: outcome.provider,
      fetchedAt,
    };
  });
}
