/**
 * The next task, created when a creator reaches a stage.
 *
 * This is the whole of the automation, on purpose. Every stage that means "somebody now
 * owes something" gets exactly one task, and nothing else happens by itself — no reminders,
 * no chasing, no status moving on its own. The team should never wonder why a row changed.
 */

import { inDays } from "@/lib/campaigns/dates";
import type { InfluencerStatus } from "@/lib/campaigns/status";

export type TaskTemplate = {
  name: string;
  /** Days from now, used only when the creator has no deadline of their own. */
  dueInDays: number;
};

/**
 * Reaching a stage on the left creates the task on the right.
 *
 * `CONTENT_PENDING` is the stage where content is with us and unreviewed, so it is what
 * raises the review task. `SELECTED` and `CONTACTED` have no entry: nobody owes anything
 * before a creator has agreed.
 */
const ON_REACHING: Partial<Record<InfluencerStatus, TaskTemplate>> = {
  CONFIRMED: { name: "Send brief", dueInDays: 2 },
  CONTENT_PENDING: { name: "Review content", dueInDays: 3 },
  APPROVED: { name: "Track publishing", dueInDays: 5 },
  PUBLISHED: { name: "Collect analytics", dueInDays: 7 },
  // The work being finished is not the same as the creator being paid, and paying is the
  // step that quietly gets forgotten once everyone has moved on to the next campaign.
  COMPLETED: { name: "Release payment", dueInDays: 7 },
};

/**
 * Whether this template still applies.
 *
 * The payment task is the one that can be pointless the moment it is created: a creator paid
 * up front is Completed and settled at the same time, and raising "Release payment" for
 * money already sent is exactly the noise that makes people stop trusting the list.
 */
export function taskIsNeeded(template: TaskTemplate, settled: boolean): boolean {
  return template.name !== "Release payment" || !settled;
}

export function taskForStatus(status: InfluencerStatus): TaskTemplate | null {
  return ON_REACHING[status] ?? null;
}

/**
 * When the generated task is due.
 *
 * The creator's own deadline wins when there is one and it has not already passed —
 * everything for that creator is meant to land by then. A deadline in the past would create
 * a task that is overdue the instant it exists, which is noise rather than information, so
 * the template's own spacing is used instead.
 */
export function dueDateFor(
  template: TaskTemplate,
  deadline: Date | null,
  now: Date = new Date(),
): Date {
  if (deadline && deadline.getTime() > now.getTime()) return deadline;
  return inDays(template.dueInDays, now);
}
