/**
 * Reading tasks.
 *
 * Everything the screens show that is not stored — the state, the time left, the counts —
 * is worked out here, once, from the rows. Nothing recomputes it in a component, so the
 * badge on a tab and the list under it cannot disagree.
 */

import { istDay } from "@/lib/campaigns/dates";
import type { Viewer } from "@/lib/campaigns/visibility";
import { PAYMENT_TASK } from "@/lib/campaigns/visibility";
import type { Person } from "@/lib/campaigns/types";
import { prisma } from "@/lib/db";
import { millisAtWork, presenceFor } from "@/lib/tasks/attendance";
import {
  millisLeft,
  millisSpent,
  priorityRank,
  reminderIsDue,
  stateOf,
  toPriority,
  type TaskState,
} from "@/lib/tasks/model";
import type { Insights, MyDay, TaskCounts, TaskItem, TeamToday } from "@/lib/tasks/types";

/**
 * Selected everywhere a task is read.
 *
 * One shape for every reader, so a field added for one screen cannot be quietly missing on
 * another and produce a different derived state.
 */
const TASK_SELECT = {
  id: true,
  name: true,
  description: true,
  brand: true,
  priority: true,
  kind: true,
  dueDate: true,
  dueHasTime: true,
  startedAt: true,
  completedAt: true,
  reminderMinutes: true,
  remindedAt: true,
  note: true,
  assignedTo: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  campaign: { select: { id: true, name: true, brand: true } },
} as const;

type TaskRow = {
  id: string;
  name: string;
  description: string | null;
  brand: string | null;
  priority: string;
  dueDate: Date | null;
  dueHasTime: boolean;
  startedAt: Date | null;
  completedAt: Date | null;
  reminderMinutes: number | null;
  note: string | null;
  assignedTo: { id: string; name: string; email: string } | null;
  createdBy: { id: string; name: string; email: string } | null;
  campaign: { id: string; name: string; brand: string } | null;
};

function toPerson(row: { id: string; name: string; email: string } | null): Person | null {
  return row ? { id: row.id, name: row.name, email: row.email } : null;
}

export function toTaskItem(task: TaskRow, now: Date): TaskItem {
  return {
    id: task.id,
    name: task.name,
    description: task.description,
    priority: toPriority(task.priority),
    state: stateOf(task, now),
    // The campaign already knows its brand, so a campaign task reads it from there rather
    // than keeping a second copy that would survive the campaign being corrected.
    brand: task.campaign?.brand ?? task.brand,
    campaign: task.campaign ? { id: task.campaign.id, name: task.campaign.name } : null,
    assignedTo: toPerson(task.assignedTo),
    assignedBy: toPerson(task.createdBy),
    dueDate: task.dueDate?.toISOString() ?? null,
    dueHasTime: task.dueHasTime,
    millisLeft: millisLeft(task, now),
    startedAt: task.startedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    millisSpent: millisSpent(task),
    reminderMinutes: task.reminderMinutes,
    note: task.note,
  };
}

/**
 * Priority first, then the deadline.
 *
 * This order is the whole point of the list. "What is most important" beats "what is
 * soonest", because a low-priority task due in an hour should not push a high-priority one
 * off the top of somebody's morning. Tasks with no deadline sort last within their
 * priority: they are the ones that can wait, by definition.
 */
export function byPriorityThenDeadline(a: TaskItem, b: TaskItem): number {
  const rank = priorityRank(a.priority) - priorityRank(b.priority);
  if (rank !== 0) return rank;
  if (a.dueDate === null) return b.dueDate === null ? 0 : 1;
  if (b.dueDate === null) return -1;
  return Date.parse(a.dueDate) - Date.parse(b.dueDate);
}

export function countStates(items: Array<{ state: TaskState }>): TaskCounts {
  const counts: TaskCounts = {
    total: items.length,
    completed: 0,
    inProgress: 0,
    pending: 0,
    overdue: 0,
  };
  for (const { state } of items) {
    if (state === "COMPLETED") counts.completed += 1;
    else if (state === "OVERDUE") counts.overdue += 1;
    else if (state === "IN_PROGRESS") counts.inProgress += 1;
    else counts.pending += 1;
  }
  return counts;
}

/** A member never receives a payment task, on this screen as on every other. */
function moneyFilter(viewer: Viewer) {
  return viewer.canSeeMoney ? {} : { kind: { not: PAYMENT_TASK } };
}

/** How far ahead "upcoming" looks. A week is context; a month is a second backlog. */
const UPCOMING_DAYS = 7;

/**
 * One person's day.
 *
 * Everything unfinished is fetched rather than only today's, because a task that was due
 * last Tuesday is still today's problem and would vanish from a query filtered on today.
 */
export async function myDay(viewer: Viewer, now: Date = new Date()): Promise<MyDay> {
  const today = istDay(now);

  const [rows, doneToday, presence] = await Promise.all([
    prisma.task.findMany({
      where: { assignedToId: viewer.id, completedAt: null, ...moneyFilter(viewer) },
      select: TASK_SELECT,
    }),
    prisma.task.findMany({
      where: {
        assignedToId: viewer.id,
        completedAt: { not: null },
        ...moneyFilter(viewer),
      },
      orderBy: { completedAt: "desc" },
      take: 50,
      select: TASK_SELECT,
    }),
    presenceFor(today, [viewer.id]),
  ]);

  const overdue: TaskItem[] = [];
  const todayList: TaskItem[] = [];
  const upcoming: TaskItem[] = [];
  const reminders: TaskItem[] = [];

  for (const row of rows) {
    const item = toTaskItem(row, now);
    if (reminderIsDue(row, now)) reminders.push(item);

    if (item.state === "OVERDUE") {
      overdue.push(item);
      continue;
    }

    // No deadline means it is not tied to a day, so it belongs with today's work: the
    // alternative is a task nobody ever sees because it is never due.
    if (!row.dueDate || istDay(row.dueDate) <= today) {
      todayList.push(item);
    } else if (daysBetween(today, istDay(row.dueDate)) <= UPCOMING_DAYS) {
      upcoming.push(item);
    }
  }

  overdue.sort(byPriorityThenDeadline);
  todayList.sort(byPriorityThenDeadline);
  upcoming.sort(byPriorityThenDeadline);

  const completedToday = doneToday
    .filter((row) => row.completedAt && istDay(row.completedAt) === today)
    .map((row) => toTaskItem(row, now));

  return {
    overdue,
    today: todayList,
    upcoming,
    completedToday,
    reminders,
    signedInAt: presence.get(viewer.id)?.signedInAt.toISOString() ?? null,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * The floor, today.
 *
 * "Today" here means what is live rather than what was created today: everything
 * unfinished, plus what was finished today. A manager asking "where are we" wants the
 * backlog in that answer, not just the tasks that happen to share a creation date.
 */
export async function teamToday(now: Date = new Date()): Promise<TeamToday> {
  const today = istDay(now);

  const [people, unfinished, finishedToday] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.task.findMany({ where: { completedAt: null }, select: TASK_SELECT }),
    prisma.task.findMany({
      where: { completedAt: { gte: startOfIstDay(today) } },
      select: TASK_SELECT,
    }),
  ]);

  const presence = await presenceFor(today);

  const live = [...unfinished, ...finishedToday].map((row) => ({
    item: toTaskItem(row, now),
    assignedToId: row.assignedTo?.id ?? null,
  }));

  const byPerson = new Map<string, TaskItem[]>();
  for (const { item, assignedToId } of live) {
    if (!assignedToId) continue;
    const list = byPerson.get(assignedToId) ?? [];
    list.push(item);
    byPerson.set(assignedToId, list);
  }

  const overdue = live
    .map(({ item }) => item)
    .filter((item) => item.state === "OVERDUE")
    .sort(byPriorityThenDeadline);

  return {
    counts: countStates(live.map(({ item }) => item)),
    people: people.map((person) => {
      const seen = presence.get(person.id);
      return {
        person: { id: person.id, name: person.name, email: person.email },
        role: person.role,
        counts: countStates(byPerson.get(person.id) ?? []),
        signedInAt: seen?.signedInAt.toISOString() ?? null,
        signedOutAt: seen?.signedOutAt?.toISOString() ?? null,
        millisAtWork: millisAtWork(seen),
      };
    }),
    overdue,
  };
}

function startOfIstDay(day: string): Date {
  return new Date(`${day}T00:00:00.000+05:30`);
}

/** How far back the insights look by default. Two weeks is enough to see a pattern. */
export const INSIGHT_DAYS = 14;

/**
 * Where the time is going.
 *
 * Only completed work counts towards an average, and only work that was actually started
 * counts towards a duration — a task ticked off without ever being started has no duration,
 * and treating it as instant would drag every average towards zero and make the slow ones
 * look fine.
 */
export async function insights(days: number = INSIGHT_DAYS, now: Date = new Date()): Promise<Insights> {
  const from = new Date(now.getTime() - days * DAY_MS);

  const rows = await prisma.task.findMany({
    where: { OR: [{ completedAt: { gte: from } }, { completedAt: null, dueDate: { gte: from } }] },
    select: TASK_SELECT,
  });

  const items = rows.map((row) => ({ row, item: toTaskItem(row, now) }));

  const perPerson = new Map<
    string,
    { person: Person; completed: number; overdue: number; totalMillis: number; timed: number }
  >();

  const byName = new Map<string, { times: number; totalMillis: number; timed: number; lateTimes: number }>();

  let completed = 0;
  let overdue = 0;
  let totalMillis = 0;

  for (const { row, item } of items) {
    const spent = item.millisSpent;

    if (item.state === "COMPLETED") completed += 1;
    if (item.state === "OVERDUE") overdue += 1;
    if (spent !== null) totalMillis += spent;

    if (item.assignedTo) {
      const entry = perPerson.get(item.assignedTo.id) ?? {
        person: item.assignedTo,
        completed: 0,
        overdue: 0,
        totalMillis: 0,
        timed: 0,
      };
      if (item.state === "COMPLETED") entry.completed += 1;
      if (item.state === "OVERDUE") entry.overdue += 1;
      if (spent !== null) {
        entry.totalMillis += spent;
        entry.timed += 1;
      }
      perPerson.set(item.assignedTo.id, entry);
    }

    const name = row.name.trim();
    const group = byName.get(name) ?? { times: 0, totalMillis: 0, timed: 0, lateTimes: 0 };
    group.times += 1;
    if (spent !== null) {
      group.totalMillis += spent;
      group.timed += 1;
    }
    // Late means it went past its deadline, whether or not it was eventually finished:
    // a task that was three days late and then done is still a process that does not fit.
    if (item.state === "OVERDUE" || (item.completedAt && wasLate(row))) group.lateTimes += 1;
    byName.set(name, group);
  }

  return {
    from: istDay(from),
    to: istDay(now),
    perPerson: [...perPerson.values()]
      .map((entry) => ({
        person: entry.person,
        completed: entry.completed,
        overdue: entry.overdue,
        totalMillis: entry.totalMillis,
        averageMillis: entry.timed > 0 ? Math.round(entry.totalMillis / entry.timed) : null,
      }))
      .sort((a, b) => b.completed - a.completed),
    slowest: [...byName.entries()]
      .map(([name, group]) => ({
        name,
        times: group.times,
        lateTimes: group.lateTimes,
        averageMillis: group.timed > 0 ? Math.round(group.totalMillis / group.timed) : null,
      }))
      // The ones worth acting on are the ones that are late repeatedly, not the single
      // task that overran once because somebody was off sick.
      .filter((entry) => entry.lateTimes > 0)
      .sort((a, b) => b.lateTimes - a.lateTimes || b.times - a.times)
      .slice(0, 8),
    totals: { completed, overdue, totalMillis },
  };
}

/** Whether a finished task crossed its deadline before it was finished. */
function wasLate(row: { dueDate: Date | null; dueHasTime: boolean; completedAt: Date | null }): boolean {
  if (!row.dueDate || !row.completedAt) return false;
  if (row.dueHasTime) return row.completedAt.getTime() > row.dueDate.getTime();
  return istDay(row.completedAt) > istDay(row.dueDate);
}
