import { NextResponse } from "next/server";
import { z } from "zod";
import { denyFloor, requireViewer } from "@/lib/campaigns/viewer";
import { firstIssue } from "@/lib/credentials";
import { PRIORITIES } from "@/lib/tasks/model";
import {
  completeTask,
  deleteTask,
  editTask,
  markReminded,
  mayChange,
  reopenTask,
  setNote,
  startTask,
} from "@/lib/tasks/mutations";
import { myDay } from "@/lib/tasks/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Everything one person does to a task they hold: start it, finish it, put it back, say why
 * it ran long, and dismiss its reminder. Reassigning and re-dating are separate, because
 * they are the manager's and not the assignee's.
 */
const patchSchema = z.object({
  action: z.enum(["start", "complete", "reopen", "note", "reminded", "edit"]),
  note: z.string().max(500).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  brand: z.string().trim().max(120).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignedToId: z.string().trim().min(1).optional(),
  dueDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  reminderMinutes: z.number().int().min(1).max(7 * 24 * 60).nullable().optional(),
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

  const allowed = await mayChange(id, auth.viewer);
  // The same answer for a task that does not exist and one that is not theirs: a 403 here
  // would confirm the id is real, which is the one thing the reply should not say.
  if (!allowed.ok) {
    return NextResponse.json({ error: "That task is not yours." }, { status: 404 });
  }

  switch (input.action) {
    case "start":
      await startTask(id);
      break;
    case "complete":
      await completeTask(id, auth.viewer.id, auth.session.name);
      break;
    case "reopen":
      await reopenTask(id);
      break;
    case "note":
      await setNote(id, input.note ?? "");
      break;
    case "reminded":
      await markReminded([id]);
      break;
    case "edit":
      // Rewriting what the work is, who has it or when it is due is a rota decision.
      if (!auth.viewer.canRunTheFloor) return denyFloor();
      await editTask(id, {
        name: input.name,
        description: input.description,
        brand: input.brand,
        priority: input.priority,
        assignedToId: input.assignedToId,
        dueDay: input.dueDay,
        dueTime: input.dueTime,
        reminderMinutes: input.reminderMinutes,
      });
      break;
  }

  return NextResponse.json({ day: await myDay(auth.viewer) });
}

export async function DELETE(_request: Request, context: Context) {
  const auth = await requireViewer();
  if (auth.response) return auth.response;
  if (!auth.viewer.canRunTheFloor) return denyFloor();

  const { id } = await context.params;
  const allowed = await mayChange(id, auth.viewer);
  if (!allowed.ok) {
    return NextResponse.json({ error: "That task is not yours." }, { status: 404 });
  }

  await deleteTask(id);
  return NextResponse.json({ day: await myDay(auth.viewer) });
}
