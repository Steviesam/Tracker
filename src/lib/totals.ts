import { PLATFORMS, type LinkResult, type Metrics, type Platform } from "@/lib/types";

export type MetricKey = keyof Metrics;

export const METRIC_KEYS: MetricKey[] = ["views", "likes", "comments", "shares"];

export const METRIC_LABEL: Record<MetricKey, string> = {
  views: "Views",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
};

export type MetricTotal = {
  /** Sum of the links that reported this metric, or null when none did. */
  total: number | null;
  /** How many links reported it, against how many were asked. A total of 1.2M from 3 of
   *  40 links means something very different from 1.2M from 40 of 40. */
  available: number;
  of: number;
};

export type ResultTotals = {
  links: number;
  byPlatform: Record<Platform, number>;
  metrics: Record<MetricKey, MetricTotal>;
  /** Links where nothing could be retrieved at all. */
  failed: number;
};

/**
 * Aggregates the results for the overview. Sums skip nulls rather than treating them as
 * zero, and every total carries how many links it came from, so a partial sum can never
 * be mistaken for a complete one.
 */
export function totalsOf(results: LinkResult[]): ResultTotals {
  const byPlatform = Object.fromEntries(PLATFORMS.map((p) => [p, 0])) as Record<Platform, number>;
  const metrics = Object.fromEntries(
    METRIC_KEYS.map((key) => [key, { total: null, available: 0, of: results.length }]),
  ) as Record<MetricKey, MetricTotal>;

  let failed = 0;

  for (const result of results) {
    byPlatform[result.platform] += 1;
    if (result.status === "unavailable" || result.status === "error") failed += 1;

    for (const key of METRIC_KEYS) {
      const value = result.metrics[key];
      if (value === null) continue;
      const entry = metrics[key];
      entry.total = (entry.total ?? 0) + value;
      entry.available += 1;
    }
  }

  return { links: results.length, byPlatform, metrics, failed };
}
