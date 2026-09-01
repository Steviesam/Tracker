import { apifyConfig } from "@/lib/env";
import type { DetectedLink, Platform } from "@/lib/types";
import {
  errored,
  toCount,
  toIsoDate,
  unavailable,
  type MetricsProvider,
  type ProviderOutcome,
} from "@/lib/providers/types";

/**
 * Third-party public-data provider (Apify).
 *
 * Meta's official APIs cannot return metrics for Instagram or Facebook content the caller
 * does not own — Business Discovery covers only public professional accounts queried by
 * username, and Facebook insights require a Page token. A commercial data provider is the
 * only way to read arbitrary public URLs, which is what this adapter is for.
 *
 * Before enabling it, confirm the provider's terms and your own legal position: these
 * actors read public pages rather than calling an authorised platform API, which Meta's
 * terms restrict. That is a deliberate configuration choice, which is why it is off by
 * default and never silently enabled.
 *
 * Actors differ in their output shape, so the normaliser below accepts the common field
 * spellings rather than assuming one actor.
 */

const RUN_TIMEOUT_MS = 120_000;

type ApifyItem = Record<string, unknown>;

/** Skips a key whose value is a hidden-count sentinel, so a later spelling can answer. */
function firstNumber(item: ApifyItem, keys: string[]): number | null {
  for (const key of keys) {
    const value = toCount(item[key]);
    if (value !== null) return value;
  }
  return null;
}

function firstString(item: ApifyItem, keys: string[]): string | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

function nested(item: ApifyItem, key: string): ApifyItem | null {
  const value = item[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as ApifyItem) : null;
}

/**
 * Lifts nested fields to the top level so one normaliser can read every actor.
 *
 * Some actors return Instagram's raw media object, where the counts sit under `metrics`,
 * the author under `user`, the caption under `caption.text`, and there is no permalink at
 * all — only the shortcode in `code`.
 */
function flatten(item: ApifyItem): ApifyItem {
  const flat: ApifyItem = { ...item, ...(nested(item, "metrics") ?? {}) };

  const username = nested(item, "user")?.username;
  if (typeof username === "string") flat.username = username;

  const captionText = nested(item, "caption")?.text;
  if (typeof captionText === "string") flat.text = captionText;

  if (!flat.url && typeof item.code === "string") {
    flat.url = `https://www.instagram.com/p/${item.code}/`;
  }

  return flat;
}

/** Maps one dataset item onto our metric shape, tolerating actor-specific field names. */
export function normaliseItem(raw: ApifyItem): {
  url: string | null;
  creator: string | null;
  title: string | null;
  postedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
} {
  const item = flatten(raw);
  return {
    // `postCode` is last because on a successful row it holds a shortcode rather than a
    // URL; on a failed one it is the only echo of which URL the row is about, and without
    // it the failure cannot be matched back to a link and is reported as silence instead.
    url: firstString(item, ["url", "postUrl", "inputUrl", "permalink", "link", "postCode"]),
    creator: firstString(item, [
      "ownerUsername",
      "username",
      "profileHandle",
      "author",
      "authorName",
      "pageName",
      "channelName",
      "owner",
    ]),
    title: firstString(item, ["caption", "text", "title", "description", "message"]),
    postedAt: toIsoDate(
      item.timestamp ??
        item.takenAt ??
        item.taken_at ??
        item.publishedAt ??
        item.datePosted ??
        item.date ??
        item.time ??
        item.createdAt,
    ),
    // Instagram exposes two counts for the same reel: `videoPlayCount` (every play,
    // replays included) and the much smaller legacy `videoViewCount` (3-second views).
    // Instagram's own UI labels the former "views", so it is preferred — otherwise the
    // number here would not match what the creator sees, and would differ between
    // actors depending on which field each one happens to return.
    views: firstNumber(item, [
      "videoPlayCount",
      "playCount",
      "play_count",
      "ig_play_count",
      "videoViewCount",
      "viewCount",
      // Facebook actors spell it differently, and report total plays separately from
      // the count attributed to the post itself; the total is the closer analogue.
      "viewsCount",
      "videoPostViewCount",
      "views",
      "plays",
    ]),
    likes: firstNumber(item, ["likesCount", "likeCount", "like_count", "likes", "reactionsCount"]),
    comments: firstNumber(item, ["commentsCount", "commentCount", "comment_count", "comments"]),
    shares: firstNumber(item, [
      "sharesCount",
      "shareCount",
      "share_count",
      "shares",
      "reshareCount",
    ]),
  };
}

/**
 * Returns why an actor rejected a single URL, or null when the row is usable. Actors signal
 * this inconsistently — some set `error`, others a `status` other than "available".
 */
function itemFailure(item: ApifyItem): string | null {
  const error = firstString(item, ["errorDescription", "error"]);
  if (error) return error;
  if (item.success === false) return "the provider could not read this post";
  const status = firstString(item, ["status"]);
  return status && status.toLowerCase() !== "available" ? status : null;
}

/** Normalises a URL for matching provider output back to the link we asked about. */
function matchKey(url: string): string {
  const lower = url.toLowerCase().replace(/\/+$/, "");
  const shortcode = lower.match(/\/(?:p|reel|reels|tv)\/([^/?#]+)/)?.[1];
  if (shortcode) return `ig:${shortcode}`;
  const fbId = lower.match(/\/reel\/(\d+)|[?&]v=(\d+)|\/videos\/(?:[^/]+\/)?(\d+)/);
  if (fbId) return `fb:${fbId[1] ?? fbId[2] ?? fbId[3]}`;
  return lower;
}

async function runActor(actorId: string, token: string, input: unknown): Promise<ApifyItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`${response.status} ${response.statusText}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
    }

    const body = await response.json();
    return Array.isArray(body) ? (body as ApifyItem[]) : [];
  } finally {
    clearTimeout(timer);
  }
}

type InputBuilder = (urls: string[]) => Record<string, unknown>;

/**
 * Actors disagree on how URLs are passed, so each one we have verified gets its own shape.
 * `resultsLimit` is per URL and each of ours is a single post, so 1 keeps the bill minimal.
 */
const ACTOR_INPUTS: Record<string, InputBuilder> = {
  "data-slayer~instagram-post-details": (urls) => ({ postUrls: urls }),
  "apify~instagram-scraper": (urls) => ({ directUrls: urls, resultsType: "posts", resultsLimit: 1 }),
  "clappi~facebook-posts-reels-scraper": (urls) => ({ postUrls: urls }),
  "apify~facebook-posts-scraper": (urls) => ({ startUrls: urls.map((url) => ({ url })), resultsLimit: 1 }),
  "danek~facebook-posts-fast": (urls) => ({ direct_urls: urls.map((url) => ({ url })) }),
};

/** Used for actors we have not verified; `startUrls` is the most common convention. */
const FALLBACK_INPUT: InputBuilder = (urls) => ({
  startUrls: urls.map((url) => ({ url })),
  resultsLimit: 1,
});

function buildInput(actorId: string, urls: string[]): Record<string, unknown> {
  // Apify accepts both `user/actor` and `user~actor`; normalise before lookup.
  return (ACTOR_INPUTS[actorId.replace("/", "~")] ?? FALLBACK_INPUT)(urls);
}

function makeProvider(platform: Platform, actorFor: (config: NonNullable<ReturnType<typeof apifyConfig>>) => string | undefined) {
  const name = `apify:${platform.toLowerCase()}`;

  const provider: MetricsProvider = {
    name,

    isConfigured() {
      const config = apifyConfig();
      return Boolean(config && actorFor(config));
    },

    async fetch(links: DetectedLink[]): Promise<Map<string, ProviderOutcome>> {
      const results = new Map<string, ProviderOutcome>();
      const config = apifyConfig();
      const actorId = config ? actorFor(config) : undefined;

      if (!config || !actorId) {
        for (const link of links) {
          results.set(link.id, unavailable("No public-data provider configured for this platform.", name));
        }
        return results;
      }

      let items: ApifyItem[];
      try {
        items = await runActor(
          actorId,
          config.token,
          buildInput(actorId, links.map((link) => link.canonicalUrl)),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "provider request failed";
        for (const link of links) results.set(link.id, errored(`${name} error: ${message}`, name));
        return results;
      }

      const byKey = new Map<string, ReturnType<typeof normaliseItem>>();
      const failures = new Map<string, string>();
      for (const item of items) {
        const normalised = normaliseItem(item);
        if (!normalised.url) continue;
        const key = matchKey(normalised.url);
        // Some actors report a per-URL failure in the row rather than omitting it.
        const reason = itemFailure(item);
        if (reason) failures.set(key, reason);
        else byKey.set(key, normalised);
      }

      for (const link of links) {
        const key = matchKey(link.canonicalUrl);
        const found = byKey.get(key);
        if (!found) {
          const reason = failures.get(key);
          results.set(
            link.id,
            unavailable(
              reason
                ? `The provider could not read this URL (${reason}). It may be private, age-restricted or removed.`
                : "The provider returned no data for this URL — it may be private or removed.",
              name,
            ),
          );
          continue;
        }

        const missing: string[] = [];
        if (found.views === null) missing.push("views");
        if (found.shares === null) missing.push("shares");

        results.set(link.id, {
          creator: found.creator,
          creatorId: platform === "INSTAGRAM" ? found.creator : null,
          title: found.title,
          postedAt: found.postedAt,
          status: missing.length > 0 ? "partial" : "ok",
          // Photos and text posts genuinely have no views or shares, so this is phrased as
          // "not published" rather than blaming the provider for omitting them.
          note: missing.length > 0 ? `Not published for this post: ${missing.join(", ")}.` : null,
          provider: name,
          metrics: {
            views: found.views,
            likes: found.likes,
            comments: found.comments,
            shares: found.shares,
          },
        });
      }

      return results;
    },
  };

  return provider;
}

export const instagramPublicDataProvider = makeProvider("INSTAGRAM", (config) => config.instagramActor);
export const facebookPublicDataProvider = makeProvider("FACEBOOK", (config) => config.facebookActor);
