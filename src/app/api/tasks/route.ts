import { NextResponse } from "next/server";
import { z } from "zod";
import { people } from "@/lib/campaigns/queries";
import { denyFloor, requireViewer } from "@/lib/campaigns/viewer";
import { firstIssue } from "@/lib/credentials";
import { prisma } from "@/lib/db";
import { markPresent } from "@/lib/tasks/attendance";
import { PRIORITIES } from "@/lib/tasks/model";
import { createTask } from "@/lib/tasks/mutations";
import { myDay } from "@/lib/tasks/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One person's day.
 *
 * Reading this also marks them present. The alternative — a heartbeat endpoint — would be a
 * request whose only purpose is to say somebody is still there, and the app already makes
 * one every time it refreshes the list they are looking at.
 */
export async function GET() {
  const auth = await requireViewer();
  if (auth.response) return auth.response;

  await markPresent(auth.viewer.id);

  const [day, team] = await Promise.all([
    myDay(auth.viewer),
    // The assignee list is only useful to someone who may assign, and sending the roster to
    // everyone would hand out the team's email addresses for no reason.
    auth.viewer.canRunTheFloor ? people() : Promise.resolve([]),
  ]);

  return NextResponse.json({
    day,
    people: team,
    canRunTheFloor: auth.viewer.canRunTheFloor,
    me: auth.viewer.id,
  });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the task a name.").max(200),
  description: z.string().trim().max(2000).optional(),
  brand: z.string().trim().max(120).optional(),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  assignedToId: z.string().trim().min(1, "Assign the task to somebody."),
  campaignId: z.string().trim().optional(),
  dueDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a deadline date.").optional(),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/, "That time is not valid.").optional(),
  reminderMinutes: z.number().int().min(1).max(7 * 24 * 60).optional(),
});

/** Assigning work. Only an owner or a manager hands work out. */
export async function POST(request: Request) {
  const auth = await requireViewer();
  if (auth.response) return auth.response;
  if (!auth.viewer.canRunTheFloor) return denyFloor();

  let input;
  try {
    input = createSchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof z.ZodError ? firstIssue(error) : "Check the details you entered.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const assignee = await prisma.user.findUnique({
    where: { id: input.assignedToId },
    select: { id: true },
  });
  if (!assignee) {
    return NextResponse.json({ error: "That person no longer has an account." }, { status: 400 });
  }

  if (input.campaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: input.campaignId },
      select: { id: true },
    });
    if (!campaign) return NextResponse.json({ error: "No such campaign." }, { status: 400 });
  }

  await createTask(
    {
      name: input.name,
      description: input.description || null,
      brand: input.brand || null,
      priority: input.priority,
      assignedToId: input.assignedToId,
      campaignId: input.campaignId || null,
      dueDay: input.dueDay ?? null,
      dueTime: input.dueTime ?? null,
      reminderMinutes: input.reminderMinutes ?? null,
    },
    auth.viewer.id,
  );

  return NextResponse.json({ day: await myDay(auth.viewer) });
}
