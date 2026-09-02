/**
 * The stages a campaign and a creator move through.
 *
 * Both are ordered lists rather than free text, because the overview counts, the progress
 * bar and the automation all depend on knowing where a creator is. Stored as the keys
 * below, never as the labels, so renaming what the team calls a stage does not rewrite
 * history or break a filter.
 */

export const CAMPAIGN_STATUSES = ["PLANNING", "ACTIVE", "COMPLETED", "ON_HOLD"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  PLANNING: "Planning",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  ON_HOLD: "On hold",
};

/** In the order the work actually happens, which is also the order they are shown. */
export const INFLUENCER_STATUSES = [
  "SELECTED",
  "CONTACTED",
  "CONFIRMED",
  "CONTENT_PENDING",
  "APPROVED",
  "PUBLISHED",
  "COMPLETED",
] as const;
export type InfluencerStatus = (typeof INFLUENCER_STATUSES)[number];

export const INFLUENCER_STATUS_LABEL: Record<InfluencerStatus, string> = {
  SELECTED: "Selected",
  CONTACTED: "Contacted",
  CONFIRMED: "Confirmed",
  CONTENT_PENDING: "Content pending",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  COMPLETED: "Completed",
};

export const PLATFORMS = ["instagram", "youtube"] as const;
export type CampaignPlatform = (typeof PLATFORMS)[number];

export function isCampaignStatus(value: unknown): value is CampaignStatus {
  return CAMPAIGN_STATUSES.includes(value as CampaignStatus);
}

export function isInfluencerStatus(value: unknown): value is InfluencerStatus {
  return INFLUENCER_STATUSES.includes(value as InfluencerStatus);
}

/**
 * A stored status that is no longer one we know — an old row, or a hand-edited database.
 * Falling back to the first stage keeps a screen rendering instead of throwing.
 */
export function toInfluencerStatus(value: string): InfluencerStatus {
  return isInfluencerStatus(value) ? value : "SELECTED";
}

export function toCampaignStatus(value: string): CampaignStatus {
  return isCampaignStatus(value) ? value : "PLANNING";
}

/** Where a stage sits in the sequence, for sorting and for "how far along is this". */
export function stageIndex(status: InfluencerStatus): number {
  return INFLUENCER_STATUSES.indexOf(status);
}
