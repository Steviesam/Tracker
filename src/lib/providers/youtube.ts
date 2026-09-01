import { youtubeApiKey } from "@/lib/env";
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

const NAME = "youtube-data-api-v3";

const SHARES_NOTE = "Shares are only in YouTube Analytics, which requires the channel owner.";

type VideoItem = {
  id: string;
  snippet?: { title?: string; channelTitle?: string; channelId?: string; publishedAt?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
};

/**
 * YouTube Data API v3 — the one platform where a server API key returns real public
 * metrics for content the caller does not own. Free quota is 10,000 units/day and
 * videos.list costs 1 unit per call (up to 50 ids), so this scales comfortably.
 */
export const youtubeProvider: MetricsProvider = {
  name: NAME,

  isConfigured() {
    return Boolean(youtubeApiKey());
  },

  async fetch(links: DetectedLink[]): Promise<Map<string, ProviderOutcome>> {
    const results = new Map<string, ProviderOutcome>();
    const apiKey = youtubeApiKey();

    if (!apiKey) {
      for (const link of links) {
        results.set(link.id, unavailable("YOUTUBE_API_KEY is not set.", NAME));
      }
      return results;
    }

    const withIds = links.filter((link) => link.externalId);
    for (const link of links) {
      if (!link.externalId) {
        results.set(link.id, unavailable("Could not read a video id from this URL.", NAME));
      }
    }

    for (let offset = 0; offset < withIds.length; offset += 50) {
      const batch = withIds.slice(offset, offset + 50);
      const ids = batch.map((link) => link.externalId).join(",");
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${encodeURIComponent(ids)}&key=${encodeURIComponent(apiKey)}`;

      try {
        const body = (await fetchJson(url)) as { items?: VideoItem[] };
        const byId = new Map((body.items ?? []).map((item) => [item.id, item]));

        for (const link of batch) {
          const item = byId.get(link.externalId as string);
          if (!item) {
            results.set(
              link.id,
              unavailable("Video not found — it may be private, deleted, or region-locked.", NAME),
            );
            continue;
          }

          // An absent likeCount means the creator hid it; that is unknown, not zero.
          const likes = toNumber(item.statistics?.likeCount);
          const notes = [SHARES_NOTE];
          if (likes === null) notes.push("The creator has hidden the like count.");

          results.set(link.id, {
            creator: item.snippet?.channelTitle ?? null,
            creatorId: item.snippet?.channelId ?? null,
            title: item.snippet?.title ?? null,
            postedAt: toIsoDate(item.snippet?.publishedAt),
            status: "partial",
            note: notes.join(" "),
            provider: NAME,
            metrics: {
              views: toNumber(item.statistics?.viewCount),
              likes,
              comments: toNumber(item.statistics?.commentCount),
              shares: null,
            },
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "YouTube request failed";
        for (const link of batch) results.set(link.id, errored(`YouTube API error: ${message}`, NAME));
      }
    }

    return results;
  },
};
