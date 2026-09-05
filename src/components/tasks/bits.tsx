"use client";

/** Small pieces shared by the task screens, so every list reads the same. */

import { formatDay, formatDuration, formatTimeLeft, formatTimeOfDay } from "@/lib/format";
import { PRIORITY_LABEL, TASK_STATE_LABEL, type Priority, type TaskState } from "@/lib/tasks/model";

/**
 * Priority as a traffic light.
 *
 * Red, amber, green, in that order down the list. The colour is doing the work here: an
 * employee scanning fifteen rows is not reading the word "High", they are looking for the
 * red ones and starting there.
 */
const PRIORITY_TONE: Record<Priority, { chip: string; dot: string }> = {
  HIGH: { chip: "bg-rose-50 text-rose-700 ring-rose-200/70", dot: "bg-rose-500" },
  MEDIUM: { chip: "bg-amber-50 text-amber-700 ring-amber-200/70", dot: "bg-amber-500" },
  LOW: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-200/70", dot: "bg-emerald-500" },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const tone = PRIORITY_TONE[priority];
  return (
    <span className={`chip whitespace-nowrap ${tone.chip}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

const STATE_TONE: Record<TaskState, string> = {
  PENDING: "bg-slate-50 text-slate-600 ring-slate-200",
  IN_PROGRESS: "bg-sky-50 text-sky-700 ring-sky-200/70",
  COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
  OVERDUE: "bg-rose-50 text-rose-700 ring-rose-200/70",
};

export function StateBadge({ state }: { state: TaskState }) {
  return (
    <span className={`chip whitespace-nowrap ${STATE_TONE[state]}`}>{TASK_STATE_LABEL[state]}</span>
  );
}

/**
 * A deadline and how long is left of it.
 *
 * Both, always. "11:00 am" alone makes someone work out what that means from the clock in
 * the corner, and "in 40m" alone cannot be written down or repeated to anybody. The pair is
 * what the request asked for and it is also simply what a person needs.
 */
export function Deadline({
  iso,
  hasTime,
  millisLeft,
  done,
}: {
  iso: string | null;
  hasTime: boolean;
  millisLeft: number | null;
  done: boolean;
}) {
  if (!iso) return <span className="text-slate-400">No deadline</span>;

  const when = hasTime ? `${formatDay(iso)}, ${formatTimeOfDay(iso)}` : formatDay(iso);
  if (done) return <span className="text-slate-500">{when}</span>;

  const late = millisLeft !== null && millisLeft < 0;
  // Under an hour is the point at which "today" stops being a useful answer and the
  // countdown starts mattering, so that is where it turns amber.
  const soon = millisLeft !== null && millisLeft >= 0 && millisLeft < 60 * 60 * 1000;

  return (
    <span className={late ? "text-rose-600" : soon ? "text-amber-600" : "text-slate-500"}>
      {when}
      {millisLeft !== null ? (
        <span className={late || soon ? "font-medium" : ""}> · {formatTimeLeft(millisLeft)}</span>
      ) : null}
    </span>
  );
}

/** How long a finished task took, next to the times it ran between. */
export function TimeTaken({
  startedAt,
  completedAt,
  millisSpent,
}: {
  startedAt: string | null;
  completedAt: string | null;
  millisSpent: number | null;
}) {
  if (millisSpent === null || !startedAt || !completedAt) return null;
  return (
    <span className="text-slate-500">
      {formatTimeOfDay(startedAt)} – {formatTimeOfDay(completedAt)} ·{" "}
      <span className="font-medium text-slate-700">{formatDuration(millisSpent)}</span>
    </span>
  );
}

/**
 * A running clock, ticking in the browser.
 *
 * Every other figure on these screens comes from the server, but a timer that only moved
 * when the page reloaded would not read as running at all — and "started an hour ago,
 * still going" is the one thing this element exists to say.
 */
export function RunningFor({ since, now }: { since: string; now: number }) {
  return (
    <span className="tabular-nums text-sky-700">
      running {formatDuration(now - Date.parse(since))}
    </span>
  );
}
