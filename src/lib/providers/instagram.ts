import { instagramAccessToken, instagramOembedToken, instagramUserId } from "@/lib/env";
import type { DetectedLink } from "@/lib/types";
import {
  errored,
  fetchJson,
  toIsoDate,
  toNumber,
  unavailable,
  type MetricsProvider,
  type ProviderOutcome,
} from "@/lib/providers/types";

const NAME = "instagram-business-discovery";
const GRAPH = "https://graph.facebook.com/v21.0";
const MAX_PAGES = 10;
/** Bound on concurrent oEmbed lookups, to stay well inside Meta's rate limits. */
const RESOLVE_CONCURRENCY = 4;

const NOT_CONFIGURED =
  "Instagram is not configured. Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID.";
const UNRESOLVED =
  "Could not determine the creator for this URL. oEmbed lookup failed, so Business Discovery (which is queried by username) cannot be used. Add a creator column to the file, or configure a public-data provider that accepts URLs directly.";
const NOT_FOUND =
  "Not returned by Business Discovery. It only covers public Business/Creator accounts — personal and age-gated accounts are excluded, as is media older than the returned window.";
const NO_SHARES = "Shares are not exposed by Business Discovery.";
const NEEDS_APP_REVIEW =
  "Instagram credentials are valid, but Meta has not granted this app Advanced Access for Business Discovery. It requires business verification and App Review before other creators' metrics can be read.";

type Media = {
  id: string;
  permalink?: string;
  caption?: string;
  timestamp?: string;
  media_type?: string;
  like_count?: number;
  comments_count?: number;
  view_count?: number;
};

type DiscoveryResponse = {
  business_discovery?: {
    username?: string;
    media?: { data?: Media[]; paging?: { cursors?: { after?: string } } };
  };
};

function shortcodeOf(url: string): string | null {
  const match = url.match(/\/(?:p|reel|reels|tv)\/([^/?#]+)/i);
  return match ? match[1] : null;
}

function normaliseHandle(value: string | null | undefined): string | null {
  if (!value) return null;
  const handle = value.trim().replace(/^@/, "");
  // Usernames are letters, numbers, dots and underscores; anything else is a display name.
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle : null;
}

/**
 * Resolves a post URL to its creator's username via Instagram's oEmbed endpoint.
 *
 * Business Discovery is queried by username, but most spreadsheet URLs are the bare
 * /reel/{shortcode} form with no handle in them. oEmbed is the official way to go from a
 * public post URL to its author, so the user never has to supply usernames by hand.
 */
async function resolveUsername(url: string, token: string): Promise<string | null> {
  try {
    const endpoint = `${GRAPH}/instagram_oembed?url=${encodeURIComponent(url)}&fields=author_name&access_token=${encodeURIComponent(token)}`;
    const body = (await fetchJson(endpoint, undefined, 15000)) as { author_name?: string };
    return normaliseHandle(body.author_name);
  } catch {
    return null;
  }
}

/** Runs an async mapper over items with a fixed worker pool. */
async function mapPooled<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

/**
 * Instagram Graph API — Business Discovery, with automatic creator resolution.
 *
 * Limits, all surfaced to the user rather than hidden:
 *  - The target must be a public Business or Creator account (not personal, not age-gated).
 *  - The caller needs their own Instagram professional account and a Facebook app.
 *  - Only recent media is reachable; older posts fall outside the paginated window.
 *  - view_count, like_count and comments_count are available; shares and saves are not.
 *  - Rate limit is 1,000 queries per user per hour.
 */
export const instagramProvider: MetricsProvider = {
  name: NAME,

  isConfigured() {
    return Boolean(instagramAccessToken() && instagramUserId());
  },

  async fetch(links: DetectedLink[]): Promise<Map<string, ProviderOutcome>> {
    const results = new Map<string, ProviderOutcome>();
    const token = instagramAccessToken();
    const userId = instagramUserId();

    if (!token || !userId) {
      for (const link of links) results.set(link.id, unavailable(NOT_CONFIGURED, NAME));
      return results;
    }

    // Prefer a username already present in the file or URL; otherwise ask oEmbed.
    const oembedToken = instagramOembedToken() ?? token;
    const resolved = await mapPooled(links, RESOLVE_CONCURRENCY, async (link) => {
      const fromInput = normaliseHandle(link.creatorHint);
      if (fromInput) return { link, username: fromInput };
      return { link, username: await resolveUsername(link.canonicalUrl, oembedToken) };
    });

    // One Business Discovery call per creator covers all of that creator's links.
    const byUsername = new Map<string, DetectedLink[]>();
    for (const { link, username } of resolved) {
      if (!username) {
        results.set(link.id, unavailable(UNRESOLVED, NAME));
        continue;
      }
      const bucket = byUsername.get(username);
      if (bucket) bucket.push(link);
      else byUsername.set(username, [link]);
    }

    for (const [username, creatorLinks] of byUsername) {
      let media: Media[];
      try {
        media = await loadCreatorMedia(username, userId, token);
      } catch (error) {
        const message = error instanceof Error ? error.message : "request failed";
        // Meta gates Business Discovery behind Advanced Access, so an otherwise correct
        // setup still fails until App Review passes. Say so instead of "request failed".
        const needsReview = /does not have permission|\(#10\)/i.test(message);
        const outcome = needsReview
          ? unavailable(NEEDS_APP_REVIEW, NAME)
          : errored(`Instagram API error for @${username}: ${message}`, NAME);
        for (const link of creatorLinks) results.set(link.id, outcome);
        continue;
      }

      const byShortcode = new Map<string, Media>();
      for (const item of media) {
        const shortcode = item.permalink ? shortcodeOf(item.permalink) : null;
        if (shortcode) byShortcode.set(shortcode, item);
      }

      for (const link of creatorLinks) {
        const shortcode = shortcodeOf(link.canonicalUrl);
        const item = shortcode ? byShortcode.get(shortcode) : undefined;

        if (!item) {
          // The creator is known even when the media is not, so still report it.
          results.set(link.id, {
            ...unavailable(NOT_FOUND, NAME),
            creator: `@${username}`,
            creatorId: username,
          });
          continue;
        }

        results.set(link.id, {
          creator: `@${username}`,
          creatorId: username,
          title: item.caption?.slice(0, 120) ?? null,
          postedAt: toIsoDate(item.timestamp),
          status: "partial",
          note: NO_SHARES,
          provider: NAME,
          metrics: {
            views: toNumber(item.view_count),
            likes: toNumber(item.like_count),
            comments: toNumber(item.comments_count),
            shares: null,
          },
        });
      }
    }

    return results;
  },
};

async function loadCreatorMedia(username: string, userId: string, token: string): Promise<Media[]> {
  const mediaFields = "permalink,caption,timestamp,media_type,like_count,comments_count,view_count";
  const collected: Media[] = [];
  let after: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const cursor = after ? `.after(${after})` : "";
    const fields = `business_discovery.username(${username}){media${cursor}{${mediaFields}}}`;
    const url = `${GRAPH}/${userId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;

    const body = (await fetchJson(url)) as DiscoveryResponse;
    const mediaPage = body.business_discovery?.media;
    collected.push(...(mediaPage?.data ?? []));

    after = mediaPage?.paging?.cursors?.after;
    if (!after || (mediaPage?.data ?? []).length === 0) break;
  }

  return collected;
}
