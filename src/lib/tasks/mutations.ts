/**
 * Changing a task.
 *
 * There is one place a task is completed, whichever screen the tick was clicked on. That is
 * what makes finishing a campaign task on the Tasks screen move the campaign along without
 * anybody opening the campaign — the automatic update the module is meant to provide is not
 * a second write triggered by the first, it is the same write.
 */

import { record } from "@/lib/campaigns/activity";
import { fromDayInput } from "@/lib/campaigns/dates";
import { PAYMENT_TASK, type Viewer } from "@/lib/campaigns/visibility";
import { prisma } from "@/lib/db";
import { isPriority, type Priority } from "@/lib/tasks/model";

export type NewTask = {
  name: string;
  description?: string | null;
  brand?: string | null;
  priority: Priority;
  assignedToId: string | null;
  campaignId?: string | null;
  /** `YYYY-MM-DD`, read as an Indian day. */
  dueDay?: string | null;
  /** `HH:MM` on that day. Absent means the task is due by the end of it. */
  dueTime?: string | null;
  reminderMinutes?: number | null;
};

/**
 * Turns a date and an optional time into one instant, and says which it was.
 *
 * Kept together because the two answers have to agree: a `dueHasTime` of true beside a
 * midnight timestamp would make an all-day task overdue at one minute past midnight, which
 * is the single most annoying bug this feature could have.
 */
export function deadlineFrom(
  dueDay: string | null | undefined,
  dueTime: string | null | undefined,
): { dueDate: Date | null; dueHasTime: boolean } {
  if (!dueDay) return { dueDate: null, dueHasTime: false };

  if (dueTime && /^\d{2}:\d{2}$/.test(dueTime)) {
    const at = new Date(`${dueDay}T${dueTime}:00.000+05:30`);
    if (!Number.isNaN(at.getTime())) return { dueDate: at, dueHasTime: true };
  }

  return { dueDate: fromDayInput(dueDay), dueHasTime: false };
}

export async function createTask(task: NewTask, createdById: string): Promise<string> {
  const { dueDate, dueHasTime } = deadlineFrom(task.dueDay, task.dueTime);

  const row = await prisma.task.create({
    data: {
      name: task.name,
      description: task.description ?? null,
      brand: task.brand ?? null,
      priority: isPriority(task.priority) ? task.priority : "MEDIUM",
      assignedToId: task.assignedToId,
      createdById,
      campaignId: task.campaignId ?? null,
      dueDate,
      dueHasTime,
      // A reminder with no deadline has nothing to count down to, so it is dropped rather
      // than stored as a setting that silently never fires.
      reminderMinutes: dueDate ? (task.reminderMinutes ?? null) : null,
    },
    select: { id: true, campaignId: true, name: true },
  });

  if (row.campaignId) {
    const actor = await nameOf(createdById);
    await record(prisma, row.campaignId, createdById, "task_added", `${actor} added ${row.name}`);
  }

  return row.id;
}

/**
 * Starts the clock.
 *
 * Starting an already-started task does nothing rather than resetting it: the button is
 * easy to press twice, and the second press should not quietly erase the first hour.
 */
export async function startTask(taskId: string, at: Date = new Date()): Promise<void> {
  await prisma.task.updateMany({
    where: { id: taskId, startedAt: null, completedAt: null },
    data: { startedAt: at },
  });
}

/**
 * Stops the clock and, when the task belongs to a campaign, writes the line that tells the
 * campaign it happened.
 *
 * A task completed without ever being started is given a start time of now, so it reads as
 * having taken no time rather than as having no timing at all — the alternative, back-dating
 * it to when it was assigned, would report a five-minute job as having taken two days.
 */
export async function completeTask(
  taskId: string,
  actorId: string,
  actorName: string,
  at: Date = new Date(),
): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, campaignId: true, name: true, kind: true, completedAt: true, startedAt: true },
  });
  if (!task) throw new Error("That task no longer exists.");
  if (task.completedAt) return;

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: { completedAt: at, startedAt: task.startedAt ?? at },
    });

    if (task.campaignId) {
      await record(
        tx,
        task.campaignId,
        actorId,
        // Ticking off a payment is still a line about money, and belongs behind the same
        // door as the amount itself.
        task.kind === PAYMENT_TASK ? "payment_task_completed" : "task_completed",
        `${actorName} completed ${task.name}`,
      );
    }
  });
}

/**
 * Puts a finished task back.
 *
 * The start time is cleared along with the completion, because a reopened task is being
 * done again and the old duration described the first attempt. Keeping it would make the
 * second attempt look as though it had been running since yesterday.
 */
export async function reopenTask(taskId: string): Promise<void> {
  await prisma.task.updateMany({
    where: { id: taskId },
    data: { completedAt: null, startedAt: null },
  });
}

/** Records why it ran long, was late, or is stuck. Blank clears it. */
export async function setNote(taskId: string, note: string): Promise<void> {
  const trimmed = note.trim();
  await prisma.task.updateMany({
    where: { id: taskId },
    data: { note: trimmed.length > 0 ? trimmed.slice(0, 500) : null },
  });
}

/** Marks the reminder as shown, so the next poll does not show it again. */
export async function markReminded(taskIds: string[], at: Date = new Date()): Promise<void> {
  if (taskIds.length === 0) return;
  await prisma.task.updateMany({
    where: { id: { in: taskIds }, remindedAt: null },
    data: { remindedAt: at },
  });
}

export type TaskEdit = {
  name?: string;
  description?: string | null;
  brand?: string | null;
  priority?: Priority;
  assignedToId?: string | null;
  dueDay?: string | null;
  dueTime?: string | null;
  reminderMinutes?: number | null;
};

/**
 * Reassigns or re-dates a task.
 *
 * Moving the deadline clears `remindedAt`: the warning that was already shown was about the
 * old time, and the person now has a new one to be warned about.
 */
export async function editTask(taskId: string, edit: TaskEdit): Promise<void> {
  const data: Record<string, unknown> = {};

  if (edit.name !== undefined) data.name = edit.name;
  if (edit.description !== undefined) data.description = edit.description;
  if (edit.brand !== undefined) data.brand = edit.brand;
  if (edit.priority !== undefined && isPriority(edit.priority)) data.priority = edit.priority;
  if (edit.assignedToId !== undefined) data.assignedToId = edit.assignedToId;
  if (edit.reminderMinutes !== undefined) data.reminderMinutes = edit.reminderMinutes;

  if (edit.dueDay !== undefined) {
    const { dueDate, dueHasTime } = deadlineFrom(edit.dueDay, edit.dueTime);
    data.dueDate = dueDate;
    data.dueHasTime = dueHasTime;
    data.remindedAt = null;
    if (!dueDate) data.reminderMinutes = null;
  }

  if (Object.keys(data).length === 0) return;
  await prisma.task.update({ where: { id: taskId }, data });
}

export async function deleteTask(taskId: string): Promise<void> {
  await prisma.task.delete({ where: { id: taskId } });
}

/**
 * Whether this person may touch this task.
 *
 * Owners and managers may touch anything. Everyone else may touch what is theirs — starting
 * it, finishing it, saying why it ran long — and nothing else. A member reassigning their
 * own work to somebody else is not an edit, it is a rota change, and that is the manager's.
 */
export async function mayChange(
  taskId: string,
  viewer: Viewer,
): Promise<{ ok: true; isOwnWork: boolean } | { ok: false }> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { assignedToId: true, kind: true },
  });
  if (!task) return { ok: false };

  // A payment task is invisible to anyone who cannot see money, and something invisible
  // must not be changeable either — otherwise it is only hidden, not withheld.
  if (task.kind === PAYMENT_TASK && !viewer.canSeeMoney) return { ok: false };

  if (viewer.canRunTheFloor) return { ok: true, isOwnWork: task.assignedToId === viewer.id };
  if (task.assignedToId === viewer.id) return { ok: true, isOwnWork: true };
  return { ok: false };
}

async function nameOf(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return user?.name ?? "Someone";
}
