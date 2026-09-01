export type Platform = "INSTAGRAM" | "YOUTUBE" | "FACEBOOK";

export const PLATFORMS: Platform[] = ["INSTAGRAM", "YOUTUBE", "FACEBOOK"];

export const PLATFORM_LABEL: Record<Platform, string> = {
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
  FACEBOOK: "Facebook",
};

/** Where a link came from, so the UI can explain the detection count. */
export type LinkSource = "file" | "paste";

export type DetectedLink = {
  id: string;
  platform: Platform;
  originalUrl: string;
  canonicalUrl: string;
  externalId: string | null;
  contentType: string;
  /** Creator handle taken from the URL or a neighbouring cell; API value wins. */
  creatorHint: string | null;
  source: LinkSource;
  /** Only set for file uploads. */
  sheet: string | null;
  row: number | null;
};

/**
 * `null` always means "could not be retrieved", and must render as N/A with a reason.
 * It is never rendered as 0 and never estimated.
 */
export type Metrics = {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
};

export const EMPTY_METRICS: Metrics = {
  views: null,
  likes: null,
  comments: null,
  shares: null,
};

export type ResultStatus = "ok" | "partial" | "unavailable" | "error";

export type LinkResult = DetectedLink & {
  creator: string | null;
  /**
   * Stable handle for the creator, used to look up account-level stats: an Instagram
   * username or a YouTube channel id. `creator` is a display name and is not reliable
   * as a key — two channels can share a title, and titles change.
   */
  creatorId: string | null;
  title: string | null;
  /** ISO date the content was published, when the provider exposes it. */
  postedAt: string | null;
  metrics: Metrics;
  status: ResultStatus;
  /** Why metrics are missing. Always populated when anything is N/A. */
  note: string | null;
  /** Which provider answered, shown so the data's origin is auditable. */
  provider: string;
  fetchedAt: string;
};

/** How many recent videos the creator averages are taken over. */
export const CREATOR_SAMPLE_SIZE = 10;

/**
 * Account-level context for one creator, fetched on demand rather than with every link,
 * because it costs an extra provider call per creator.
 */
export type CreatorStats = {
  platform: Platform;
  /** Matches `LinkResult.creatorId`. */
  creatorId: string;
  displayName: string | null;
  profileUrl: string | null;
  followers: number | null;
  /** Videos actually averaged. Can be below CREATOR_SAMPLE_SIZE for newer accounts. */
  sampleSize: number;
  avgViews: number | null;
  avgLikes: number | null;
  avgComments: number | null;
  /**
   * (avg likes + avg comments) / followers, as a percentage. Null when followers are
   * unknown, since a rate without a denominator would be meaningless.
   */
  engagementRate: number | null;
  status: ResultStatus;
  note: string | null;
  provider: string;
  fetchedAt: string;
};

export type DetectionSummary = {
  /** Filename for uploads, or "Pasted URLs". */
  sourceLabel: string;
  sheets: string[];
  rowsScanned: number;
  totalUrlsFound: number;
  duplicatesRemoved: number;
  unsupportedSkipped: number;
  uniqueLinks: number;
  byPlatform: Record<Platform, number>;
};
