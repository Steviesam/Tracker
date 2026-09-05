/**
 * What a task is, and what state it is in.
 *
 * State is derived, never stored. "Overdue" is a fact about the clock and a deadline, and a
 * stored copy would be wrong from the moment the deadline passed until something rewrote
 * it — which on a serverless host is nothing, since there is no process sitting there
 * ticking. Working it out on read means it is right the first time anybody looks.
 */

import { istDay, isPastDue } from "@/lib/campaigns/dates";

export const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABEL: Record<Priority, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

/**
 * Sort weight. High first, because the list exists to answer "what do I do first".
 *
 * The order is the array's, not the alphabet's: sorting on the stored string would put
 * HIGH after a hypothetical CRITICAL and before LOW purely by luck, and the first person to
 * add a priority would find the list silently reordered.
 */
export function priorityRank(priority: Priority): number {
  return PRIORITIES.indexOf(priority);
}

export function isPriority(value: unknown): value is Priority {
  return PRIORITIES.includes(value as Priority);
}

/** An unknown string in the column becomes Medium rather than throwing a screen away. */
export function toPriority(value: string | null | undefined): Priority {
  return isPriority(value) ? value : "MEDIUM";
}

export const TASK_STATES = ["PENDING", "IN_PROGRESS", "COMPLETED", "OVERDUE"] as const;
export type TaskState = (typeof TASK_STATES)[number];

export const TASK_STATE_LABEL: Record<TaskState, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  OVERDUE: "Overdue",
};

export type TaskTiming = {
  dueDate: Date | null;
  /** True when the deadline is a moment in the day rather than the day itself. */
  dueHasTime: boolean;
  startedAt: Date | null;
  completedAt: Date | null;
};

/**
 * Whether the deadline has passed.
 *
 * Two kinds of deadline, and conflating them is the bug this function exists to avoid. A
 * task due "on Thursday" is late on Friday morning, not at one minute past midnight on
 * Thursday. A task due "at 11:00" is late at 11:01. The stored value is a timestamp either
 * way, so only `dueHasTime` can tell them apart.
 */
export function isLate(timing: TaskTiming, now: Date = new Date()): boolean {
  if (!timing.dueDate) return false;
  if (timing.dueHasTime) return timing.dueDate.getTime() < now.getTime();
  return isPastDue(timing.dueDate, now);
}

/**
 * The one state a task is in.
 *
 * Overdue outranks in-progress on purpose. Somebody who started a task an hour after it was
 * due is still late, and a list that quietly reclassified it as merely "in progress" the
 * moment they opened it would hide exactly the thing a manager is looking for.
 */
export function stateOf(timing: TaskTiming, now: Date = new Date()): TaskState {
  if (timing.completedAt) return "COMPLETED";
  if (isLate(timing, now)) return "OVERDUE";
  return timing.startedAt ? "IN_PROGRESS" : "PENDING";
}

/** Milliseconds until the deadline; negative once it has gone. Null when there is none. */
export function millisLeft(timing: TaskTiming, now: Date = new Date()): number | null {
  if (!timing.dueDate) return null;
  // An all-day task is not late until the day is out, so it counts down to the day's end.
  const at = timing.dueHasTime ? timing.dueDate.getTime() : endOfIstDay(timing.dueDate);
  return at - now.getTime();
}

/** How long the work took, once it is finished and was actually started. */
export function millisSpent(timing: TaskTiming): number | null {
  if (!timing.startedAt || !timing.completedAt) return null;
  const spent = timing.completedAt.getTime() - timing.startedAt.getTime();
  return spent >= 0 ? spent : null;
}

/**
 * How long a running task has been running.
 *
 * Separate from `millisSpent` because a running total is not a result: it is only true for
 * the instant it was read, and callers that store it or compare it against finished work
 * should have to say so.
 */
export function millisRunning(timing: TaskTiming, now: Date = new Date()): number | null {
  if (!timing.startedAt || timing.completedAt) return null;
  return Math.max(0, now.getTime() - timing.startedAt.getTime());
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The last millisecond of that Indian day, as an instant. */
function endOfIstDay(at: Date): number {
  return Date.parse(`${istDay(at)}T00:00:00.000+05:30`) + DAY_MS - 1;
}

/**
 * Whether the assignee should be warned now.
 *
 * Only for work that is unfinished, has a deadline, asked for a warning, and has not been
 * warned already. The last condition is what keeps a reminder from firing on every poll for
 * the rest of the afternoon — one nag is a reminder, twenty is a reason to stop reading them.
 */
export function reminderIsDue(
  task: TaskTiming & { reminderMinutes: number | null; remindedAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (task.completedAt || task.remindedAt || task.reminderMinutes === null) return false;
  const left = millisLeft(task, now);
  if (left === null) return false;
  return left <= task.reminderMinutes * 60 * 1000;
}

/** The lead times offered when assigning. Minutes, so a call and a day both fit. */
export const REMINDER_CHOICES: Array<{ minutes: number; label: string }> = [
  { minutes: 15, label: "15 minutes before" },
  { minutes: 30, label: "30 minutes before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 180, label: "3 hours before" },
  { minutes: 24 * 60, label: "1 day before" },
];

/**
 * The default lead time when nobody picks one.
 *
 * Thirty minutes is enough to start something small and not so early that the warning
 * arrives while the task is still tomorrow's problem.
 */
export const DEFAULT_REMINDER_MINUTES = 30;
