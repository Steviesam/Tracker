import type { DetectionOutcome } from "@/lib/detect";
import { PLATFORMS, type DetectionSummary, type Platform } from "@/lib/types";

export function buildSummary(input: {
  sourceLabel: string;
  sheets: string[];
  rowsScanned: number;
  detection: DetectionOutcome;
}): DetectionSummary {
  const byPlatform = Object.fromEntries(
    PLATFORMS.map((platform) => [
      platform,
      input.detection.links.filter((link) => link.platform === platform).length,
    ]),
  ) as Record<Platform, number>;

  return {
    sourceLabel: input.sourceLabel,
    sheets: input.sheets,
    rowsScanned: input.rowsScanned,
    totalUrlsFound: input.detection.totalUrlsFound,
    duplicatesRemoved: input.detection.duplicatesRemoved,
    unsupportedSkipped: input.detection.unsupportedSkipped,
    uniqueLinks: input.detection.links.length,
    byPlatform,
  };
}
