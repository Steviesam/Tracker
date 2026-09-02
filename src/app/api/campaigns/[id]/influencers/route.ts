import { NextResponse } from "next/server";
import { z } from "zod";
import { record } from "@/lib/campaigns/activity";
import { fromDayInput } from "@/lib/campaigns/dates";
import { parsePaste } from "@/lib/campaigns/handles";
import {
  addInfluencers,
  changeStatus,
  recordPayment,
  type NewInfluencer,
} from "@/lib/campaigns/mutations";
import { findCampaign } from "@/lib/campaigns/queries";
import { INFLUENCER_STATUSES, PLATFORMS } from "@/lib/campaigns/status";
import { denyMoney, requireViewer } from "@/lib/campaigns/viewer";
import { firstIssue } from "@/lib/credentials";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** One paste, one Discovery selection. Beyond this the screen becomes unreadable anyway. */
const MAX_PER_ADD = 100;

const addSchema = z.object({
  /** Chosen in Discovery: usernames that already exist in the directory. */
  usernames: z.array(z.string().trim().min(1)).max(MAX_PER_ADD).optional(),
  /** Typed or pasted: handles, profile links, even a reel link. */
  text: z.string().max(20_000).optional(),
});

export async function POST(request: Request, context: Context) {
  const auth = await requireViewer();
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const campaign = await prisma.campaign.findUnique({ where: { id }, select: { id: true } });
  if (!campaign) return NextResponse.json({ error: "No such campaign." }, { status: 404 });

  let input;
  try {
    input = addSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? firstIssue(error) : "Check what you sent.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const rows = new Map<string, NewInfluencer>();
  const rejected: string[] = [];

  // From the directory: the follower count and display name are already known, so they come
  // across without costing a provider call.
  if (input.usernames?.length) {
    const creators = await prisma.creator.findMany({
      where: { username: { in: input.usernames.map((name) => name.toLowerCase()) } },
      select: { id: true, username: true, displayName: true, followers: true },
    });
    for (const creator of creators) {
      rows.set(`instagram:${creator.username}`, {
        platform: "instagram",
        handle: creator.username,
        displayName: creator.displayName,
        creatorId: creator.id,
        followers: creator.followers,
      });
    }
  }

  if (input.text?.trim()) {
    const parsed = parsePaste(input.text);
    rejected.push(...parsed.rejected);
    for (const found of parsed.influencers) {
      const key = `${found.platform}:${found.handle}`;
      if (!rows.has(key)) rows.set(key, found);
    }
  }

  if (rows.size === 0) {
    return NextResponse.json(
      {
        error:
          rejected.length > 0
            ? `Could not read: ${rejected.slice(0, 3).join(", ")}. Paste a profile link or a handle.`
            : "Nobody to add.",
      },
      { status: 400 },
    );
  }

  const result = await addInfluencers(
    id,
    auth.session.uid,
    auth.session.name,
    [...rows.values()].slice(0, MAX_PER_ADD),
  );

  return NextResponse.json({
    ...result,
    rejected,
    campaign: await findCampaign(id, auth.viewer),
  });
}

const patchSchema = z.object({
  influencerId: z.string().min(1),
  status: z.enum(INFLUENCER_STATUSES).optional(),
  assignedToId: z.string().nullable().optional(),
  agreedRate: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
  /** A total, not an addition — the box on screen shows a total. */
  amountPaid: z.number().int().min(0).max(2_000_000_000).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  platform: z.enum(PLATFORMS).optional(),
});

export async function PATCH(request: Request, context: Context) {
  const auth = await requireViewer();
  if (auth.response) return auth.response;

  const { id } = await context.params;

  let input;
  try {
    input = patchSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? firstIssue(error) : "Check what you sent.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // A member is never shown these boxes, so anything arriving in them was hand-made.
  if ((input.agreedRate !== undefined || input.amountPaid !== undefined) && !auth.viewer.canSeeMoney) {
    return denyMoney();
  }

  const influencer = await prisma.campaignInfluencer.findUnique({
    where: { id: input.influencerId },
    select: { campaignId: true },
  });
  if (!influencer || influencer.campaignId !== id) {
    return NextResponse.json({ error: "That influencer is not on this campaign." }, { status: 404 });
  }

  // The status goes through its own path because it is the one change that creates work and
  // writes history. Everything else is a plain edit.
  if (input.status) {
    await changeStatus(input.influencerId, auth.session.uid, auth.session.name, input.status);
  }

  const deadline =
    input.deadline === undefined ? undefined : input.deadline ? fromDayInput(input.deadline) : null;
  if (input.deadline && deadline === null) {
    return NextResponse.json({ error: "That deadline is not a valid date." }, { status: 400 });
  }

  const edits = {
    assignedToId: input.assignedToId === undefined ? undefined : input.assignedToId || null,
    agreedRate: input.agreedRate === undefined ? undefined : input.agreedRate,
    deadline,
    platform: input.platform,
  };

  if (Object.values(edits).some((value) => value !== undefined)) {
    await prisma.campaignInfluencer.update({ where: { id: input.influencerId }, data: edits });
  }

  // Money moves last, and through its own path, so it is judged against the rate as it
  // stands after any edit above — and so every change to it leaves a line in the history.
  if (input.amountPaid !== undefined) {
    await recordPayment(
      input.influencerId,
      auth.session.uid,
      auth.session.name,
      input.amountPaid,
    );
  }

  return NextResponse.json({ campaign: await findCampaign(id, auth.viewer) });
}

export async function DELETE(request: Request, context: Context) {
  const auth = await requireViewer();
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const influencerId = new URL(request.url).searchParams.get("influencerId");
  if (!influencerId) return NextResponse.json({ error: "Which influencer?" }, { status: 400 });

  const influencer = await prisma.campaignInfluencer.findUnique({
    where: { id: influencerId },
    select: { campaignId: true, handle: true },
  });
  if (!influencer || influencer.campaignId !== id) {
    return NextResponse.json({ error: "That influencer is not on this campaign." }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    // Their generated tasks go with them, by the cascade — leaving "Send brief — someone"
    // on the board for a creator who is off the campaign is worse than losing the row.
    await tx.campaignInfluencer.delete({ where: { id: influencerId } });
    await record(
      tx,
      id,
      auth.session.uid,
      "influencer_removed",
      `${auth.session.name} removed ${influencer.handle}`,
    );
  });

  return NextResponse.json({ campaign: await findCampaign(id, auth.viewer) });
}
