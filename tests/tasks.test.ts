import { describe, expect, it } from "vitest";
import { canRunTheFloor, isRole, MANAGER, MEMBER, OWNER } from "@/lib/access";
import { formatDuration, formatTimeLeft } from "@/lib/format";
import {
  isLate,
  millisLeft,
  millisRunning,
  millisSpent,
  priorityRank,
  reminderIsDue,
  stateOf,
  toPriority,
} from "@/lib/tasks/model";
import { deadlineFrom } from "@/lib/tasks/mutations";
import { byPriorityThenDeadline, countStates } from "@/lib/tasks/queries";
import { millisAtWork } from "@/lib/tasks/attendance";
import type { TaskItem } from "@/lib/tasks/types";

/** 11:00 in India on the 5th, and a few instants around it. */
const ELEVEN = new Date("2026-09-05T11:00:00+05:30");
const TEN_THIRTY = new Date("2026-09-05T10:30:00+05:30");
const ELEVEN_OH_ONE = new Date("2026-09-05T11:01:00+05:30");

function timing(over: Partial<Parameters<typeof stateOf>[0]> = {}) {
  return {
    dueDate: null,
    dueHasTime: false,
    startedAt: null,
    completedAt: null,
    ...over,
  };
}

describe("the two kinds of deadline", () => {
  it("makes a timed task late one minute after its time", () => {
    const task = timing({ dueDate: ELEVEN, dueHasTime: true });
    expect(isLate(task, TEN_THIRTY)).toBe(false);
    expect(isLate(task, ELEVEN_OH_ONE)).toBe(true);
  });

  /**
   * The bug this whole flag exists to prevent: an all-day task stored as midnight would be
   * "past its timestamp" from 00:01, and every one of them would be red all morning.
   */
  it("keeps an all-day task on time until the day is out", () => {
    const allDay = timing({ dueDate: new Date("2026-09-05T00:00:00+05:30"), dueHasTime: false });
    expect(isLate(allDay, new Date("2026-09-05T00:01:00+05:30"))).toBe(false);
    expect(isLate(allDay, new Date("2026-09-05T23:59:00+05:30"))).toBe(false);
    expect(isLate(allDay, new Date("2026-09-06T00:01:00+05:30"))).toBe(true);
  });

  it("counts an all-day task down to the end of its day, not to its midnight", () => {
    const allDay = timing({ dueDate: new Date("2026-09-05T00:00:00+05:30"), dueHasTime: false });
    const left = millisLeft(allDay, new Date("2026-09-05T22:00:00+05:30"));
    // Two hours of the day remain, so the countdown must be positive, not a day negative.
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(2 * 60 * 60 * 1000 + 1000);
  });

  it("has nothing to count down to without a deadline", () => {
    expect(millisLeft(timing(), ELEVEN)).toBeNull();
    expect(isLate(timing(), ELEVEN)).toBe(false);
  });
});

describe("what state a task is in", () => {
  it("is pending before it is started", () => {
    expect(stateOf(timing({ dueDate: ELEVEN, dueHasTime: true }), TEN_THIRTY)).toBe("PENDING");
  });

  it("is in progress once the clock is running", () => {
    const started = timing({ dueDate: ELEVEN, dueHasTime: true, startedAt: TEN_THIRTY });
    expect(stateOf(started, new Date("2026-09-05T10:45:00+05:30"))).toBe("IN_PROGRESS");
  });

  /**
   * Overdue beats in-progress deliberately. Somebody who starts a task an hour after it was
   * due is still late, and quietly reclassifying it would hide the row a manager is looking
   * for.
   */
  it("stays overdue even once somebody has started it", () => {
    const startedLate = timing({ dueDate: ELEVEN, dueHasTime: true, startedAt: ELEVEN_OH_ONE });
    expect(stateOf(startedLate, new Date("2026-09-05T11:30:00+05:30"))).toBe("OVERDUE");
  });

  it("is completed regardless of how late it was", () => {
    const done = timing({
      dueDate: ELEVEN,
      dueHasTime: true,
      startedAt: TEN_THIRTY,
      completedAt: new Date("2026-09-06T09:00:00+05:30"),
    });
    expect(stateOf(done, new Date("2026-09-07T09:00:00+05:30"))).toBe("COMPLETED");
  });
});

describe("the timer", () => {
  it("reports the time between starting and finishing", () => {
    const done = timing({
      startedAt: new Date("2026-09-05T10:05:00+05:30"),
      completedAt: new Date("2026-09-05T11:20:00+05:30"),
    });
    expect(millisSpent(done)).toBe(75 * 60 * 1000);
    expect(formatDuration(millisSpent(done))).toBe("1h 15m");
  });

  it("has no duration until both ends are known", () => {
    expect(millisSpent(timing({ startedAt: TEN_THIRTY }))).toBeNull();
    expect(millisSpent(timing({ completedAt: ELEVEN }))).toBeNull();
  });

  it("reports a running task's elapsed time, and only while it is running", () => {
    const running = timing({ startedAt: TEN_THIRTY });
    expect(millisRunning(running, ELEVEN)).toBe(30 * 60 * 1000);
    expect(millisRunning(timing({ startedAt: TEN_THIRTY, completedAt: ELEVEN }), ELEVEN)).toBeNull();
  });
});

describe("reminders", () => {
  const base = {
    ...timing({ dueDate: ELEVEN, dueHasTime: true }),
    reminderMinutes: 30,
    remindedAt: null,
  };

  it("comes due once the lead time is reached", () => {
    expect(reminderIsDue(base, new Date("2026-09-05T10:25:00+05:30"))).toBe(false);
    expect(reminderIsDue(base, TEN_THIRTY)).toBe(true);
  });

  it("does not repeat once it has been shown", () => {
    expect(reminderIsDue({ ...base, remindedAt: TEN_THIRTY }, ELEVEN)).toBe(false);
  });

  it("says nothing about work that is asleep, finished, or never asked for a warning", () => {
    expect(reminderIsDue({ ...base, reminderMinutes: null }, TEN_THIRTY)).toBe(false);
    expect(reminderIsDue({ ...base, completedAt: TEN_THIRTY }, ELEVEN)).toBe(false);
    expect(reminderIsDue({ ...base, dueDate: null }, ELEVEN)).toBe(false);
  });

  it("still fires for something already late, so an overdue task is not silent", () => {
    expect(reminderIsDue(base, ELEVEN_OH_ONE)).toBe(true);
  });
});

describe("turning a form into one deadline", () => {
  it("reads a date and a time as an instant in India", () => {
    const { dueDate, dueHasTime } = deadlineFrom("2026-09-05", "11:00");
    expect(dueHasTime).toBe(true);
    expect(dueDate?.toISOString()).toBe("2026-09-05T05:30:00.000Z");
  });

  it("reads a date alone as a whole day", () => {
    const { dueDate, dueHasTime } = deadlineFrom("2026-09-05", null);
    expect(dueHasTime).toBe(false);
    expect(dueDate?.toISOString()).toBe("2026-09-04T18:30:00.000Z");
  });

  it("ignores a time that is not one, rather than inventing a deadline from it", () => {
    expect(deadlineFrom("2026-09-05", "elevenish").dueHasTime).toBe(false);
    expect(deadlineFrom(null, "11:00").dueDate).toBeNull();
  });
});

describe("the order of somebody's day", () => {
  function item(over: Partial<TaskItem>): TaskItem {
    return {
      id: over.name ?? "id",
      name: "Task",
      description: null,
      priority: "MEDIUM",
      state: "PENDING",
      brand: null,
      campaign: null,
      assignedTo: null,
      assignedBy: null,
      dueDate: null,
      dueHasTime: false,
      millisLeft: null,
      startedAt: null,
      completedAt: null,
      millisSpent: null,
      reminderMinutes: null,
      note: null,
      ...over,
    };
  }

  it("puts high priority first even when something lower is due sooner", () => {
    const soonButLow = item({ name: "low", priority: "LOW", dueDate: "2026-09-05T05:30:00Z" });
    const laterButHigh = item({ name: "high", priority: "HIGH", dueDate: "2026-09-06T05:30:00Z" });
    expect([soonButLow, laterButHigh].sort(byPriorityThenDeadline).map((t) => t.name)).toEqual([
      "high",
      "low",
    ]);
  });

  it("breaks a tie on priority with the deadline", () => {
    const later = item({ name: "later", priority: "HIGH", dueDate: "2026-09-06T05:30:00Z" });
    const sooner = item({ name: "sooner", priority: "HIGH", dueDate: "2026-09-05T05:30:00Z" });
    expect([later, sooner].sort(byPriorityThenDeadline).map((t) => t.name)).toEqual([
      "sooner",
      "later",
    ]);
  });

  it("sinks undated work below dated work of the same priority", () => {
    const undated = item({ name: "undated", priority: "HIGH" });
    const dated = item({ name: "dated", priority: "HIGH", dueDate: "2026-09-09T05:30:00Z" });
    expect([undated, dated].sort(byPriorityThenDeadline).map((t) => t.name)).toEqual([
      "dated",
      "undated",
    ]);
  });

  it("counts each state exactly once", () => {
    const counts = countStates([
      { state: "PENDING" },
      { state: "PENDING" },
      { state: "IN_PROGRESS" },
      { state: "COMPLETED" },
      { state: "OVERDUE" },
    ]);
    expect(counts).toEqual({ total: 5, completed: 1, inProgress: 1, pending: 2, overdue: 1 });
    expect(counts.completed + counts.inProgress + counts.pending + counts.overdue).toBe(
      counts.total,
    );
  });
});

describe("priority", () => {
  it("ranks high above medium above low", () => {
    expect(priorityRank("HIGH")).toBeLessThan(priorityRank("MEDIUM"));
    expect(priorityRank("MEDIUM")).toBeLessThan(priorityRank("LOW"));
  });

  it("falls back to medium for a value we no longer recognise", () => {
    expect(toPriority("URGENT")).toBe("MEDIUM");
    expect(toPriority(null)).toBe("MEDIUM");
    expect(toPriority("HIGH")).toBe("HIGH");
  });
});

describe("roles", () => {
  it("lets an owner and a manager run the floor, and nobody else", () => {
    expect(canRunTheFloor(OWNER)).toBe(true);
    expect(canRunTheFloor(MANAGER)).toBe(true);
    expect(canRunTheFloor(MEMBER)).toBe(false);
  });

  it("does not recognise anything outside the three", () => {
    expect(isRole("ADMIN")).toBe(false);
    expect(isRole(MANAGER)).toBe(true);
  });
});

describe("attendance", () => {
  const signedInAt = new Date("2026-09-05T09:00:00+05:30");

  it("measures to sign-out when there is one", () => {
    const spent = millisAtWork({
      signedInAt,
      lastSeenAt: new Date("2026-09-05T17:30:00+05:30"),
      signedOutAt: new Date("2026-09-05T18:00:00+05:30"),
    });
    expect(formatDuration(spent)).toBe("9h");
  });

  /** Most days end with a closed laptop, and a day left open must not grow all night. */
  it("measures to last seen when nobody signed out", () => {
    const spent = millisAtWork({
      signedInAt,
      lastSeenAt: new Date("2026-09-05T17:30:00+05:30"),
      signedOutAt: null,
    });
    expect(formatDuration(spent)).toBe("8h 30m");
  });

  it("says nothing about somebody who never arrived", () => {
    expect(millisAtWork(undefined)).toBeNull();
  });
});

describe("durations as people read them", () => {
  it("writes hours and minutes, and drops a zero minute", () => {
    expect(formatDuration(75 * 60 * 1000)).toBe("1h 15m");
    expect(formatDuration(2 * 60 * 60 * 1000)).toBe("2h");
    expect(formatDuration(45 * 60 * 1000)).toBe("45m");
    expect(formatDuration(30 * 1000)).toBe("under a minute");
    expect(formatDuration(null)).toBe("—");
  });

  /** The sign is carried by words: "-25m" beside a red badge reads as negative work. */
  it("says late rather than showing a minus", () => {
    expect(formatTimeLeft(40 * 60 * 1000)).toBe("in 40m");
    expect(formatTimeLeft(-25 * 60 * 1000)).toBe("25m late");
    expect(formatTimeLeft(null)).toBe("");
  });
});
