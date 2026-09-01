import type { CreatorStats, Platform, ResultStatus } from "@/lib/types";

export interface CreatorStatsProvider {
  /** Shown alongside the numbers so their origin is auditable. */
  readonly name: string;
  isConfigured(): boolean;
  /** Keys of the returned map are the requested ids, unchanged. */
  fetch(creatorIds: string[]): Promise<Map<string, CreatorStats>>;
}

/** A single recent video, reduced to the fields the averages are built from. */
export type CreatorVideo = {
  views: number | null;
  likes: number | null;
  comments: number | null;
};

function average(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  return Math.round(present.reduce((sum, value) => sum + value, 0) / present.length);
}

export function emptyStats(
  platform: Platform,
  creatorId: string,
  status: ResultStatus,
  note: string,
  provider: string,
): CreatorStats {
  return {
    platform,
    creatorId,
    displayName: null,
    profileUrl: null,
    followers: null,
    sampleSize: 0,
    avgViews: null,
    avgLikes: null,
    avgComments: null,
    engagementRate: null,
    status,
    note,
    provider,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Builds the averages and engagement rate from a creator's recent videos.
 *
 * Engagement rate is (avg likes + avg comments) / followers, the definition most
 * influencer-marketing tools use. Views are deliberately not in the numerator: a reel's
 * reach is dominated by how far the algorithm pushed it, so including them measures
 * distribution rather than how engaged the account's own audience is.
 */
export function summarise(
  platform: Platform,
  creatorId: string,
  videos: CreatorVideo[],
  meta: {
    displayName: string | null;
    profileUrl: string | null;
    followers: number | null;
    provider: string;
    /** Appended to any note this function generates. */
    note?: string | null;
  },
): CreatorStats {
  const avgViews = average(videos.map((video) => video.views));
  const avgLikes = average(videos.map((video) => video.likes));
  const avgComments = average(videos.map((video) => video.comments));

  const canRate = meta.followers !== null && meta.followers > 0 && avgLikes !== null;
  const engagementRate = canRate
    ? ((avgLikes + (avgComments ?? 0)) / (meta.followers as number)) * 100
    : null;

  const gaps: string[] = [];
  if (videos.length === 0) gaps.push("no recent videos were returned");
  if (meta.followers === null) gaps.push("follower count unavailable, so no engagement rate");

  const notes = [meta.note, gaps.length > 0 ? `${gaps.join("; ")}.` : null].filter(Boolean);

  return {
    platform,
    creatorId,
    displayName: meta.displayName,
    profileUrl: meta.profileUrl,
    followers: meta.followers,
    sampleSize: videos.length,
    avgViews,
    avgLikes,
    avgComments,
    engagementRate,
    status: gaps.length > 0 ? "partial" : "ok",
    note: notes.length > 0 ? notes.join(" ") : null,
    provider: meta.provider,
    fetchedAt: new Date().toISOString(),
  };
}
