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

/**
 * Trades an @handle for the channel id the rest of this file works in.
 *
 * A pasted YouTube account is a handle; every other call here is keyed by channel id, and
 * `forHandle` accepts one at a time. 1 quota unit each, and only for handles.
 */
async function resolveHandle(handle: string, apiKey: string): Promise<string | null> {
  const body = (await fetchJson(
    `${API}/channels?part=id&forHandle=${encodeURIComponent(handle)}` +
      `&key=${encodeURIComponent(apiKey)}`,
  )) as { items?: Array<{ id?: string }> };
  return body.items?.[0]?.id ?? null;
}

export const youtubeCreatorProvider: CreatorStatsProvider = {
  name: NAME,

  isConfigured() {
    return Boolean(youtubeApiKey());
  },

  async fetch(requestedIds: string[]): Promise<Map<string, CreatorStats>> {
    const results = new Map<string, CreatorStats>();
    const apiKey = youtubeApiKey();

    if (!apiKey) {
      for (const id of requestedIds) {
        results.set(id, emptyStats("YOUTUBE", id, "unavailable", NOT_CONFIGURED, NAME));
      }
      return results;
    }

    // Results are keyed by whatever the caller asked for, so a handle stays recognisable in
    // the UI even though the lookups below run on its channel id.
    const asked = new Map<string, string>();
    for (const id of requestedIds) {
      if (!id.startsWith("@")) {
        asked.set(id, id);
        continue;
      }
      try {
        const channelId = await resolveHandle(id, apiKey);
        if (channelId) asked.set(channelId, id);
        else results.set(id, emptyStats("YOUTUBE", id, "unavailable", "No channel with that handle.", NAME));
      } catch (error) {
        const message = error instanceof Error ? error.message : "request failed";
        results.set(id, emptyStats("YOUTUBE", id, "error", `YouTube API error: ${message}`, NAME));
      }
    }

    const creatorIds = [...asked.keys()];

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
          const key = asked.get(id) ?? id;
          results.set(key, emptyStats("YOUTUBE", key, "error", `YouTube API error: ${message}`, NAME));
        }
        continue;
      }

      const byId = new Map(channels.map((channel) => [channel.id, channel]));

      await Promise.all(
        batch.map(async (id) => {
          const key = asked.get(id) ?? id;
          const channel = byId.get(id);
          if (!channel) {
            results.set(
              key,
              emptyStats("YOUTUBE", key, "unavailable", "Channel not found or not public.", NAME),
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
            key,
            summarise("YOUTUBE", key, videos, {
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
