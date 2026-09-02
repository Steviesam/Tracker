/**
 * How far along a campaign is, worked out rather than typed in.
 *
 * A percentage somebody types is a number about how they feel, and it stops being true the
 * moment they stop editing it. This one is a fact about the rows: it can only move when the
 * work moves, and two people reading the same campaign always see the same figure.
 *
 * Creators and tasks are weighted equally when both exist. Counting only creators would
 * show a finished campaign while a pile of work sat undone; counting only tasks would show
 * nothing at all for a campaign that has not generated any yet.
 */

import { isPastDue, isDueToday } from "@/lib/campaigns/dates";
import { toInfluencerStatus, type InfluencerStatus } from "@/lib/campaigns/status";

export type InfluencerCounts = {
  total: number;
  confirmed: number;
  contentPending: number;
  published: number;
  completed: number;
  /** Past their deadline and not yet finished. */
  overdue: number;
};

export type TaskCounts = {
  total: number;
  completed: number;
  dueToday: number;
  overdue: number;
};

type InfluencerRow = { status: string; deadline: Date | null };
type TaskRow = { dueDate: Date | null; completedAt: Date | null };

export function countInfluencers(
  rows: InfluencerRow[],
  now: Date = new Date(),
): InfluencerCounts {
  const counts: InfluencerCounts = {
    total: rows.length,
    confirmed: 0,
    contentPending: 0,
    published: 0,
    completed: 0,
    overdue: 0,
  };

  for (const row of rows) {
    const status = toInfluencerStatus(row.status);
    // "Confirmed" on the overview means "has said yes", not "is sitting at that exact
    // stage" — otherwise the number would fall as work progressed, which reads as people
    // dropping out.
    if (hasConfirmed(status)) counts.confirmed += 1;
    if (status === "CONTENT_PENDING") counts.contentPending += 1;
    if (status === "PUBLISHED" || status === "COMPLETED") counts.published += 1;
    if (status === "COMPLETED") counts.completed += 1;
    if (status !== "COMPLETED" && isPastDue(row.deadline, now)) counts.overdue += 1;
  }

  return counts;
}

function hasConfirmed(status: InfluencerStatus): boolean {
  return status !== "SELECTED" && status !== "CONTACTED";
}

export function countTasks(rows: TaskRow[], now: Date = new Date()): TaskCounts {
  const counts: TaskCounts = { total: rows.length, completed: 0, dueToday: 0, overdue: 0 };

  for (const row of rows) {
    if (row.completedAt) {
      counts.completed += 1;
      continue;
    }
    if (isPastDue(row.dueDate, now)) counts.overdue += 1;
    else if (isDueToday(row.dueDate, now)) counts.dueToday += 1;
  }

  return counts;
}

/**
 * A whole percentage from 0 to 100.
 *
 * Empty campaigns are 0 rather than 100: nothing has been done, even though nothing is
 * outstanding, and showing a brand-new campaign as finished would be absurd.
 */
export function progressOf(influencers: InfluencerCounts, tasks: TaskCounts): number {
  const done = influencers.completed + tasks.completed;
  const total = influencers.total + tasks.total;
  if (total === 0) return 0;
  return Math.round((done / total) * 100);
}
