/**
 * Changing a campaign.
 *
 * Every change that the team would otherwise have to remember to do by hand happens in the
 * same transaction as the change itself: reaching a stage creates its task, and everything
 * writes a line of history. Splitting those apart is how a spreadsheet ends up disagreeing
 * with itself, and it is the whole reason this is not a spreadsheet.
 */

import { record, statusChangeMessage } from "@/lib/campaigns/activity";
import { dueDateFor, taskForStatus, taskIsNeeded } from "@/lib/campaigns/automation";
import { paymentState } from "@/lib/campaigns/payments";
import {
  INFLUENCER_STATUS_LABEL,
  toInfluencerStatus,
  type CampaignPlatform,
  type InfluencerStatus,
} from "@/lib/campaigns/status";
import { PAYMENT_TASK } from "@/lib/campaigns/visibility";
import { prisma } from "@/lib/db";
import { creatorKey, fetchStatsFor } from "@/lib/creators";
import type { Platform } from "@/lib/types";

/** How the two platform spellings line up: the campaign stores lowercase, providers shout. */
export function toProviderPlatform(platform: CampaignPlatform): Platform {
  return platform === "instagram" ? "INSTAGRAM" : "YOUTUBE";
}

export type NewInfluencer = {
  platform: CampaignPlatform;
  handle: string;
  displayName?: string | null;
  creatorId?: string | null;
  followers?: number | null;
};

/**
 * Adds creators to a campaign.
 *
 * Anyone already on it is skipped rather than treated as an error: adding fifteen from
 * Discovery when two are already there should add thirteen and say so, not refuse the lot.
 */
export async function addInfluencers(
  campaignId: string,
  actorId: string,
  actorName: string,
  rows: NewInfluencer[],
): Promise<{ added: number; skipped: string[] }> {
  const existing = await prisma.campaignInfluencer.findMany({
    where: { campaignId },
    select: { platform: true, handle: true },
  });
  const seen = new Set(existing.map((row) => `${row.platform}:${row.handle}`));

  const fresh: NewInfluencer[] = [];
  const skipped: string[] = [];

  for (const row of rows) {
    const key = `${row.platform}:${row.handle}`;
    if (seen.has(key)) {
      skipped.push(row.handle);
      continue;
    }
    seen.add(key);
    fresh.push(row);
  }

  if (fresh.length === 0) return { added: 0, skipped };

  await prisma.$transaction(async (tx) => {
    await tx.campaignInfluencer.createMany({
      data: fresh.map((row) => ({
        campaignId,
        platform: row.platform,
        handle: row.handle,
        displayName: row.displayName ?? null,
        creatorId: row.creatorId ?? null,
        followers: row.followers ?? null,
      })),
    });

    // One line for the batch. Fifteen separate "added X" entries would bury everything
    // else that happened that day.
    const names = fresh.map((row) => row.handle);
    const summary =
      names.length === 1
        ? `${actorName} added ${names[0]}`
        : `${actorName} added ${names.length} influencers: ${names.slice(0, 5).join(", ")}${
            names.length > 5 ? ` and ${names.length - 5} more` : ""
          }`;
    await record(tx, campaignId, actorId, "influencer_added", summary);
  });

  return { added: fresh.length, skipped };
}

/**
 * Moves a creator to a new stage, creating whatever that stage owes.
 *
 * The generated task is skipped when one with the same name is already open for this
 * creator, so moving a row back and forth does not leave a pile of identical work.
 */
export async function changeStatus(
  influencerId: string,
  actorId: string,
  actorName: string,
  next: InfluencerStatus,
): Promise<{ campaignId: string; taskCreated: string | null }> {
  const influencer = await prisma.campaignInfluencer.findUnique({
    where: { id: influencerId },
    select: {
      id: true,
      campaignId: true,
      handle: true,
      status: true,
      deadline: true,
      assignedToId: true,
      agreedRate: true,
      amountPaid: true,
      campaign: { select: { managerId: true } },
    },
  });
  if (!influencer) throw new Error("That influencer is not on this campaign.");

  const previous = toInfluencerStatus(influencer.status);
  if (previous === next) return { campaignId: influencer.campaignId, taskCreated: null };

  const template = taskForStatus(next);
  let taskCreated: string | null = null;

  await prisma.$transaction(async (tx) => {
    await tx.campaignInfluencer.update({ where: { id: influencerId }, data: { status: next } });

    await record(
      tx,
      influencer.campaignId,
      actorId,
      "status_changed",
      statusChangeMessage(actorName, influencer.handle, previous, next),
    );

    if (!template) return;
    if (!taskIsNeeded(template, paymentState(influencer) === "PAID")) return;

    const open = await tx.task.findFirst({
      where: { influencerId, name: template.name, completedAt: null },
      select: { id: true },
    });
    if (open) return;

    await tx.task.create({
      data: {
        campaignId: influencer.campaignId,
        influencerId,
        name: `${template.name} — ${influencer.handle}`,
        kind: template.kind,
        // Whoever owns the creator owns the work — except for paying them, which is the
        // owner's job and is assigned to whoever runs the campaign. Falling back to the
        // manager means a generated task is never left with nobody to do it.
        assignedToId:
          template.kind === "PAYMENT"
            ? influencer.campaign.managerId
            : (influencer.assignedToId ?? influencer.campaign.managerId),
        dueDate: dueDateFor(template, influencer.deadline),
      },
    });

    taskCreated = template.name;
    await record(
      tx,
      influencer.campaignId,
      actorId,
      template.kind === "PAYMENT" ? "payment_task_added" : "task_added",
      `${template.name} created for ${influencer.handle} after ${INFLUENCER_STATUS_LABEL[next]}`,
    );
  });

  return { campaignId: influencer.campaignId, taskCreated };
}

/**
 * Records what has been paid to a creator.
 *
 * The amount is set to a total rather than added to, because the box on screen shows a total
 * and two people correcting the same figure must not double it. Each change writes its own
 * line of history, so the running total always has a trail behind it.
 *
 * Settling the balance also closes any open payment task: having to tick something off after
 * entering the money is the kind of second step people skip, and then the list lies.
 */
export async function recordPayment(
  influencerId: string,
  actorId: string,
  actorName: string,
  amountPaid: number,
) {
  const influencer = await prisma.campaignInfluencer.findUnique({
    where: { id: influencerId },
    select: { campaignId: true, handle: true, agreedRate: true, amountPaid: true },
  });
  if (!influencer) throw new Error("That influencer is not on this campaign.");
  if (influencer.amountPaid === amountPaid) return;

  const settled = paymentState({ agreedRate: influencer.agreedRate, amountPaid }) === "PAID";

  await prisma.$transaction(async (tx) => {
    await tx.campaignInfluencer.update({
      where: { id: influencerId },
      data: { amountPaid, paidAt: settled ? new Date() : null },
    });

    const of = influencer.agreedRate ? ` of ₹${influencer.agreedRate.toLocaleString("en-IN")}` : "";
    await record(
      tx,
      influencer.campaignId,
      actorId,
      "payment_recorded",
      settled
        ? `${actorName} marked ${influencer.handle} paid in full — ₹${amountPaid.toLocaleString("en-IN")}${of}`
        : `${actorName} recorded ₹${amountPaid.toLocaleString("en-IN")}${of} paid to ${influencer.handle}`,
    );

    if (settled) {
      await tx.task.updateMany({
        where: { influencerId, kind: PAYMENT_TASK, completedAt: null },
        data: { completedAt: new Date() },
      });
    }
  });
}

/**
 * Completing and reopening live in `lib/tasks` and are re-exported here.
 *
 * There is one implementation because a task ticked off on the Tasks screen and the same
 * task ticked off inside its campaign have to do the same thing — stop the clock and write
 * the campaign's history. Two implementations would drift, and the first symptom would be a
 * campaign whose activity is missing the day somebody finished the work from the other tab.
 */
export { completeTask, reopenTask } from "@/lib/tasks/mutations";

/**
 * Takes a fresh follower count and engagement rate for creators on a campaign.
 *
 * Every account here costs a provider call, which is why this is a button and not something
 * that happens when the page opens. A lookup that comes back empty leaves the stored figures
 * alone: a blank is not news, and overwriting a good number with nothing helps nobody.
 */
export async function refreshStats(influencerIds: string[]): Promise<number> {
  const rows = await prisma.campaignInfluencer.findMany({
    where: { id: { in: influencerIds } },
    select: { id: true, platform: true, handle: true },
  });
  if (rows.length === 0) return 0;

  const stats = await fetchStatsFor(
    rows.map((row) => ({
      platform: toProviderPlatform(row.platform as CampaignPlatform),
      creatorId: row.handle,
    })),
  );

  const checkedAt = new Date();
  let updated = 0;

  await Promise.all(
    rows.map(async (row) => {
      const found = stats[creatorKey(toProviderPlatform(row.platform as CampaignPlatform), row.handle)];
      if (!found || (found.followers === null && found.engagementRate === null)) return;

      await prisma.campaignInfluencer.update({
        where: { id: row.id },
        data: {
          followers: found.followers ?? undefined,
          engagementRate: found.engagementRate ?? undefined,
          displayName: found.displayName ?? undefined,
          statsCheckedAt: checkedAt,
        },
      });
      updated += 1;
    }),
  );

  return updated;
}
