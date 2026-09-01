import { facebookAccessToken } from "@/lib/env";
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

const NAME = "facebook-graph-api";
const GRAPH = "https://graph.facebook.com/v21.0";

const NOT_CONFIGURED = "Facebook is not configured. Set FACEBOOK_ACCESS_TOKEN.";

/**
 * Meta restricts video and reel insights to a Page access token issued to someone with the
 * ANALYZE task on that specific Page. Page Public Content Access returns metadata only —
 * there is no official endpoint that returns view or engagement counts for a Page you do
 * not manage.
 *
 * So this provider works only for Pages whose token you hold. For arbitrary public
 * Facebook URLs, configure a third-party public-data provider instead; the router falls
 * back to it automatically.
 */
const NOT_OWNED =
  "Facebook only returns video metrics to the Page owner (Page token with ANALYZE). This URL belongs to a Page this token does not manage — configure a public-data provider to read arbitrary public Facebook content.";

type VideoNode = {
  id: string;
  title?: string;
  description?: string;
  created_time?: string;
  from?: { name?: string };
  likes?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
  shares?: { count?: number };
};

type InsightsResponse = { data?: Array<{ name: string; values?: Array<{ value?: number }> }> };

export const facebookProvider: MetricsProvider = {
  name: NAME,

  isConfigured() {
    return Boolean(facebookAccessToken());
  },

  async fetch(links: DetectedLink[]): Promise<Map<string, ProviderOutcome>> {
    const results = new Map<string, ProviderOutcome>();
    const token = facebookAccessToken();

    if (!token) {
      for (const link of links) results.set(link.id, unavailable(NOT_CONFIGURED, NAME));
      return results;
    }

    for (const link of links) {
      // Short links carry no id, so follow the redirect to recover one automatically.
      const videoId = link.externalId ?? (await resolveShortLink(link.canonicalUrl));
      if (!videoId) {
        results.set(
          link.id,
          unavailable(
            "Short Facebook link could not be resolved to a video id. Configure a public-data provider to read it directly.",
            NAME,
          ),
        );
        continue;
      }

      try {
        const fields =
          "id,title,description,created_time,from,likes.summary(true),comments.summary(true),shares";
        const node = (await fetchJson(
          `${GRAPH}/${videoId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`,
        )) as VideoNode;

        const insights = await loadInsights(videoId, token);

        results.set(link.id, {
          creator: node.from?.name ?? link.creatorHint,
          creatorId: null,
          title: node.title ?? node.description?.slice(0, 120) ?? null,
          postedAt: toIsoDate(node.created_time),
          status: "partial",
          note: insights.note,
          provider: NAME,
          metrics: {
            views: insights.views,
            likes: toNumber(node.likes?.summary?.total_count),
            comments: toNumber(node.comments?.summary?.total_count),
            shares: toNumber(node.shares?.count),
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Facebook request failed";
        const isPermission = /permission|OAuth|does not exist|unsupported|not authorized/i.test(message);
        results.set(
          link.id,
          isPermission ? unavailable(NOT_OWNED, NAME) : errored(`Facebook API error: ${message}`, NAME),
        );
      }
    }

    return results;
  },
};

/**
 * fb.watch and /share/ links redirect to the canonical URL, which carries the video id.
 * Following that keeps short links usable without asking the user to expand them.
 */
async function resolveShortLink(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal });
    const match = response.url.match(/\/reel\/(\d+)|[?&]v=(\d+)|\/videos\/(?:[^/]+\/)?(\d+)/);
    return match ? (match[1] ?? match[2] ?? match[3]) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function loadInsights(videoId: string, token: string) {
  try {
    const body = (await fetchJson(
      `${GRAPH}/${videoId}/video_insights?metric=total_video_views&access_token=${encodeURIComponent(token)}`,
    )) as InsightsResponse;

    const entry = (body.data ?? []).find((item) => item.name === "total_video_views");
    return { views: toNumber(entry?.values?.[0]?.value), note: null as string | null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "insights unavailable";
    return { views: null, note: `View count unavailable (${message}).` };
  }
}
