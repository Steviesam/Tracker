/**
 * What the campaign screens receive.
 *
 * Kept apart from the Prisma models so the client never imports the database layer, and so
 * dates cross as ISO strings rather than as objects that do not survive serialisation.
 */

import type { Money, PaymentState } from "@/lib/campaigns/payments";
import type { InfluencerCounts, TaskCounts } from "@/lib/campaigns/progress";
import type { CampaignPlatform, CampaignStatus, InfluencerStatus } from "@/lib/campaigns/status";

export type Person = { id: string; name: string; email: string };

export type CampaignSummary = {
  id: string;
  name: string;
  brand: string;
  status: CampaignStatus;
  startDate: string;
  endDate: string;
  manager: Person | null;
  influencers: InfluencerCounts;
  tasks: TaskCounts;
  /** Whole percent, worked out from the rows. Never typed in. */
  progress: number;
  /** Null for anyone but an owner — the figures are not sent, not merely not drawn. */
  money: Money | null;
};

export type CampaignInfluencerView = {
  id: string;
  platform: CampaignPlatform;
  handle: string;
  displayName: string | null;
  followers: number | null;
  engagementRate: number | null;
  /** Null when the numbers were never looked up. */
  statsCheckedAt: string | null;
  /** Null for anyone but an owner, as is every other figure on this row. */
  agreedRate: number | null;
  amountPaid: number | null;
  /** Worked out from the two figures above, never stored. Null when they were withheld. */
  payment: PaymentState | null;
  assignedTo: Person | null;
  status: InfluencerStatus;
  deadline: string | null;
  /** True when the deadline has passed and they are not finished. */
  overdue: boolean;
};

export type TaskView = {
  id: string;
  name: string;
  assignedTo: Person | null;
  dueDate: string | null;
  completedAt: string | null;
  /** Worked out from today in India, never stored. */
  state: "PENDING" | "COMPLETED" | "OVERDUE";
  /** The creator this task came from, when it was created by a stage change. */
  influencer: { id: string; handle: string } | null;
};

export type ActivityView = {
  id: string;
  kind: string;
  message: string;
  actor: string | null;
  createdAt: string;
};

export type CampaignDetail = {
  id: string;
  name: string;
  brand: string;
  brief: string | null;
  startDate: string;
  endDate: string;
  budget: number | null;
  status: CampaignStatus;
  manager: Person | null;
  influencers: CampaignInfluencerView[];
  tasks: TaskView[];
  activity: ActivityView[];
  counts: { influencers: InfluencerCounts; tasks: TaskCounts };
  progress: number;
  money: Money | null;
  /** What this reader is allowed to see, so the screens do not have to guess. */
  canSeeMoney: boolean;
};

/**
 * The campaign screen's landing view: what campaign work is on me today.
 *
 * Only campaign tasks. The Tasks section shows the whole day including work that belongs to
 * no campaign; this panel sits on the campaigns screen and answers the narrower question,
 * so that opening a campaign does not present the same list a second time.
 */
export type MyWork = {
  dueToday: (TaskView & { campaign: { id: string; name: string } })[];
  overdue: (TaskView & { campaign: { id: string; name: string } })[];
  activeCampaigns: number;
};
