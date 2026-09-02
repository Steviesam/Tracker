import { NextResponse } from "next/server";
import { z } from "zod";
import { record } from "@/lib/campaigns/activity";
import { fromDayInput } from "@/lib/campaigns/dates";
import { completeTask, reopenTask } from "@/lib/campaigns/mutations";
import { findCampaign } from "@/lib/campaigns/queries";
import { firstIssue } from "@/lib/credentials";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the task a name.").max(200),
  assignedToId: z.string().trim().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a due date.").optional(),
  influencerId: z.string().trim().optional(),
});

export async function POST(request: Request, context: Context) {
  const auth = await requireSession();
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: { managerId: true },
  });
  if (!campaign) return NextResponse.json({ error: "No such campaign." }, { status: 404 });

  let input;
  try {
    input = createSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? firstIssue(error) : "Check the details you entered.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const dueDate = input.dueDate ? fromDayInput(input.dueDate) : null;
  if (input.dueDate && !dueDate) {
    return NextResponse.json({ error: "That due date is not valid." }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        campaignId: id,
        name: input.name,
        // Unassigned work is work nobody does, so it falls to whoever typed it.
        assignedToId: input.assignedToId || auth.session.uid,
        dueDate,
        influencerId: input.influencerId || null,
      },
      select: { name: true },
    });
    await record(tx, id, auth.session.uid, "task_added", `${auth.session.name} added ${task.name}`);
  });

  return NextResponse.json({ campaign: await findCampaign(id) });
}

const patchSchema = z.object({
  taskId: z.string().min(1),
  completed: z.boolean(),
});

export async function PATCH(request: Request, context: Context) {
  const auth = await requireSession();
  if (auth.response) return auth.response;

  const { id } = await context.params;

  let input;
  try {
    input = patchSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? firstIssue(error) : "Check what you sent.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    select: { campaignId: true },
  });
  if (!task || task.campaignId !== id) {
    return NextResponse.json({ error: "That task is not on this campaign." }, { status: 404 });
  }

  if (input.completed) await completeTask(input.taskId, auth.session.uid, auth.session.name);
  else await reopenTask(input.taskId);

  return NextResponse.json({ campaign: await findCampaign(id) });
}

export async function DELETE(request: Request, context: Context) {
  const auth = await requireSession();
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const taskId = new URL(request.url).searchParams.get("taskId");
  if (!taskId) return NextResponse.json({ error: "Which task?" }, { status: 400 });

  await prisma.task.deleteMany({ where: { id: taskId, campaignId: id } });
  return NextResponse.json({ campaign: await findCampaign(id) });
}
