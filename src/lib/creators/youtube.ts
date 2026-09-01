import { youtubeApiKey } from "@/lib/env";
import { emptyStats, summarise, type CreatorStatsProvider, type CreatorVideo } from "@/lib/creators/types";
import { fetchJson, toNumber } from "@/lib/providers/types";
import { CREATOR_SAMPLE_SIZE, type CreatorStats } from "@/lib/types";

/**
 * YouTube channel stats from the official Data API, so this costs nothing beyond the free
 * quota. Three calls per batch of channels: channels.list for subscribers and the uploads
 * playlist, playlistItems.list for the recent uploads, videos.list for their statistics —
 * 1 quota unit each, against a 10,000/day allowance.
 *
 * search.list would also work but costs 100 units per call, which is why the uploads
 * playlist is used instead.
 */

const NAME = "youtube-data-api-v3";
const API = "https://www.googleapis.com/youtube/v3";
const BATCH = 50;

const NOT_CONFIGURED = "YOUTUBE_API_KEY is not set, so channel stats are unavailable.";

type Channel = {
  id: string;
  snippet?: { title?: string; customUrl?: string };
  statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
};

type PlaylistItem = { contentDetails?: { videoId?: string } };
type Video = { statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } };

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function recentVideos(
  uploadsPlaylist: string,
  apiKey: string,
): Promise<{ videos: CreatorVideo[]; note: string | null }> {
  const playlist = (await fetchJson(
    `${API}/playlistItems?part=contentDetails&maxResults=${CREATOR_SAMPLE_SIZE}` +
      `&playlistId=${encodeURIComponent(uploadsPlaylist)}&key=${encodeURIComponent(apiKey)}`,
  )) as { items?: PlaylistItem[] };

  const ids = (playlist.items ?? [])
    .map((item) => item.contentDetails?.videoId)
    .filter((id): id is string => Boolean(id));

  if (ids.length === 0) return { videos: [], note: null };

  const stats = (await fetchJson(
    `${API}/videos?part=statistics&id=${ids.join(",")}&key=${encodeURIComponent(apiKey)}`,
  )) as { items?: Video[] };

  const videos = (stats.items ?? []).map((video) => ({
    views: toNumber(video.statistics?.viewCount),
    // Creators can hide the like count; that video simply drops out of the average.
    likes: toNumber(video.statistics?.likeCount),
    comments: toNumber(video.statistics?.commentCount),
  }));

  return { videos, note: null };
}

export const youtubeCreatorProvider: CreatorStatsProvider = {
  name: NAME,

  isConfigured() {
    return Boolean(youtubeApiKey());
  },

  async fetch(creatorIds: string[]): Promise<Map<string, CreatorStats>> {
    const results = new Map<string, CreatorStats>();
    const apiKey = youtubeApiKey();

    if (!apiKey) {
      for (const id of creatorIds) {
        results.set(id, emptyStats("YOUTUBE", id, "unavailable", NOT_CONFIGURED, NAME));
      }
      return results;
    }

    for (const batch of chunk(creatorIds, BATCH)) {
      let channels: Channel[];
      try {
        const body = (await fetchJson(
          `${API}/channels?part=snippet,statistics,contentDetails&id=${batch.join(",")}` +
            `&key=${encodeURIComponent(apiKey)}`,
        )) as { items?: Channel[] };
        channels = body.items ?? [];
      } catch (error) {
        const message = error instanceof Error ? error.message : "request failed";
        for (const id of batch) {
          results.set(id, emptyStats("YOUTUBE", id, "error", `YouTube API error: ${message}`, NAME));
        }
        continue;
      }

      const byId = new Map(channels.map((channel) => [channel.id, channel]));

      await Promise.all(
        batch.map(async (id) => {
          const channel = byId.get(id);
          if (!channel) {
            results.set(
              id,
              emptyStats("YOUTUBE", id, "unavailable", "Channel not found or not public.", NAME),
            );
            return;
          }

          const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
          const hidden = channel.statistics?.hiddenSubscriberCount === true;
          const followers = hidden ? null : toNumber(channel.statistics?.subscriberCount);
          const customUrl = channel.snippet?.customUrl;

          let videos: CreatorVideo[] = [];
          let note: string | null = hidden ? "This channel hides its subscriber count." : null;

          if (uploads) {
            try {
              videos = (await recentVideos(uploads, apiKey)).videos;
            } catch (error) {
              const message = error instanceof Error ? error.message : "request failed";
              note = [note, `Recent uploads unavailable (${message}).`].filter(Boolean).join(" ");
            }
          }

          results.set(
            id,
            summarise("YOUTUBE", id, videos, {
              displayName: channel.snippet?.title ?? null,
              profileUrl: customUrl
                ? `https://www.youtube.com/${customUrl}`
                : `https://www.youtube.com/channel/${id}`,
              followers,
              provider: NAME,
              note,
            }),
          );
        }),
      );
    }

    return results;
  },
};
