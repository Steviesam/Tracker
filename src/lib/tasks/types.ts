/**
 * What the task screens receive.
 *
 * Kept apart from the Prisma models so the client never imports the database layer, and so
 * dates cross as ISO strings rather than as objects that do not survive serialisation.
 */

import type { Person } from "@/lib/campaigns/types";
import type { Priority, TaskState } from "@/lib/tasks/model";

export type TaskItem = {
  id: string;
  name: string;
  description: string | null;
  priority: Priority;
  /** Worked out from the clock on every read, never stored. */
  state: TaskState;

  /**
   * Who it is for. A campaign names its own brand, so this is the campaign's brand when
   * there is one and the typed-in client when there is not — one field for the reader,
   * whichever it came from.
   */
  brand: string | null;
  /** Set when finishing this moves a campaign along. */
  campaign: { id: string; name: string } | null;

  assignedTo: Person | null;
  assignedBy: Person | null;

  dueDate: string | null;
  dueHasTime: boolean;
  /** Milliseconds until the deadline; negative once it has gone. Null when there is none. */
  millisLeft: number | null;

  startedAt: string | null;
  completedAt: string | null;
  /** Milliseconds from start to finish, once both are known. */
  millisSpent: number | null;

  reminderMinutes: number | null;
  note: string | null;
};

/**
 * One employee's whole day on one screen.
 *
 * Split into the three lists a person actually reads in order — what is late, what is on
 * today, what is finished — rather than one list they have to sort in their head.
 */
export type MyDay = {
  overdue: TaskItem[];
  today: TaskItem[];
  /** Assigned to them, due after today. Kept short: it is context, not the day's work. */
  upcoming: TaskItem[];
  completedToday: TaskItem[];
  /** Tasks whose reminder has just come due, for the warning to show. */
  reminders: TaskItem[];
  /** When they signed in today, so the day has a start on the same screen as its work. */
  signedInAt: string | null;
};

/** The counts a manager reads first, for the whole team or for one person. */
export type TaskCounts = {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  overdue: number;
};

export type TeamMemberDay = {
  person: Person;
  role: string;
  counts: TaskCounts;
  /** Null when they have not signed in today. */
  signedInAt: string | null;
  signedOutAt: string | null;
  /** Milliseconds between signing in and last being seen. Null when they never arrived. */
  millisAtWork: number | null;
};

export type TeamToday = {
  counts: TaskCounts;
  people: TeamMemberDay[];
  /** Everything late across the team, worst first — the list a manager acts on. */
  overdue: TaskItem[];
};

/**
 * Where the time goes.
 *
 * Deliberately four plain numbers and a table rather than a score. A score invites ranking
 * people, which is not what anyone learns from; the table invites asking why one kind of
 * task keeps taking three hours, which is.
 */
export type Insights = {
  /** The window these figures cover, as Indian dates. */
  from: string;
  to: string;
  perPerson: Array<{
    person: Person;
    completed: number;
    /** Mean milliseconds per completed task that was actually timed. */
    averageMillis: number | null;
    overdue: number;
    totalMillis: number;
  }>;
  /**
   * Task names that keep running late, most frequent first.
   *
   * Grouped on the name because the same job is raised under the same name every time —
   * "Send brief", "Shortlist influencers" — so a name that appears here repeatedly is a
   * process that does not fit the time it is given.
   */
  slowest: Array<{
    name: string;
    times: number;
    averageMillis: number | null;
    lateTimes: number;
  }>;
  totals: { completed: number; overdue: number; totalMillis: number };
};
