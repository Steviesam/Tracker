/**
 * "Today" for a team that works in one country.
 *
 * Whether a task is due today or overdue has to mean the same thing for everyone looking at
 * it. Read from each browser's clock it would not: a deadline of the 5th is already missed
 * for someone whose laptop is set to Sydney while it is still the morning of the 5th in
 * Delhi, and the two would see different numbers on the same screen. So the day boundary is
 * India's, fixed, on the server.
 *
 * India has no daylight saving and has held +05:30 since 1945, so a constant offset is
 * exactly right here rather than merely convenient.
 */

const IST_OFFSET_MINUTES = 5 * 60 + 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The calendar date in India at that instant, as `YYYY-MM-DD`. */
export function istDay(at: Date = new Date()): string {
  const shifted = new Date(at.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * True when the due date falls on today's Indian date.
 *
 * Both sides are reduced to a calendar day first. Due dates are stored as timestamps but
 * meant as days, so comparing the instants directly would make a task set at 6pm "not due
 * today" at 9am the same morning.
 */
export function isDueToday(due: Date | null, now: Date = new Date()): boolean {
  if (!due) return false;
  return istDay(due) === istDay(now);
}

/** True when the due date's Indian day is already behind us. */
export function isPastDue(due: Date | null, now: Date = new Date()): boolean {
  if (!due) return false;
  return istDay(due) < istDay(now);
}

/** Whole days from today; negative when the date has gone. */
export function daysFromToday(due: Date | null, now: Date = new Date()): number | null {
  if (!due) return null;
  const a = Date.parse(`${istDay(due)}T00:00:00Z`);
  const b = Date.parse(`${istDay(now)}T00:00:00Z`);
  return Math.round((a - b) / DAY_MS);
}

/** A date `days` from now, used for the due dates the automation sets itself. */
export function inDays(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

/** Parses a date input's `YYYY-MM-DD` as an Indian day, not as UTC midnight. */
export function fromDayInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000+05:30`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Formats a stored timestamp back into what a date input expects. */
export function toDayInput(value: Date | null): string {
  return value ? istDay(value) : "";
}
