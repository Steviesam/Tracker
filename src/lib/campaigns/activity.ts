/**
 * The campaign's history.
 *
 * Sentences are written at the time and stored, not rebuilt from ids when read. A year from
 * now the stage may have been renamed and the person may have left, and the line should
 * still say what it said on the day it happened.
 */

import type { Prisma } from "@prisma/client";
import { INFLUENCER_STATUS_LABEL, type InfluencerStatus } from "@/lib/campaigns/status";

/**
 * Every kind beginning `payment_` is money, and money is owner-only. The prefix is the
 * whole rule — a reader filters on it rather than knowing each name — so a new kind about
 * money is hidden correctly by being named correctly.
 */
export type ActivityKind =
  | "influencer_added"
  | "influencer_removed"
  | "status_changed"
  | "task_added"
  | "task_completed"
  | "payment_recorded"
  | "payment_task_added"
  | "payment_task_completed"
  | "campaign_updated";

export const MONEY_ACTIVITY_PREFIX = "payment_";

export function isMoneyActivity(kind: string): boolean {
  return kind.startsWith(MONEY_ACTIVITY_PREFIX);
}

type Client = Prisma.TransactionClient | typeof import("@/lib/db").prisma;

export async function record(
  db: Client,
  campaignId: string,
  actorId: string | null,
  kind: ActivityKind,
  message: string,
) {
  await db.activity.create({ data: { campaignId, actorId, kind, message } });
}

export function statusChangeMessage(
  actorName: string,
  handle: string,
  from: InfluencerStatus,
  to: InfluencerStatus,
): string {
  return `${actorName} changed ${handle} from ${INFLUENCER_STATUS_LABEL[from]} → ${INFLUENCER_STATUS_LABEL[to]}`;
}
