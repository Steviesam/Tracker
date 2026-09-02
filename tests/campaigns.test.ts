import { describe, expect, it } from "vitest";
import { dueDateFor, taskForStatus, taskIsNeeded } from "@/lib/campaigns/automation";
import { money, paymentState } from "@/lib/campaigns/payments";
import {
  daysFromToday,
  fromDayInput,
  isDueToday,
  isPastDue,
  istDay,
  toDayInput,
} from "@/lib/campaigns/dates";
import { displayHandle, normaliseHandle, parsePaste } from "@/lib/campaigns/handles";
import { countInfluencers, countTasks, progressOf } from "@/lib/campaigns/progress";
import { INFLUENCER_STATUSES, stageIndex, toInfluencerStatus } from "@/lib/campaigns/status";

describe("Indian day boundaries", () => {
  it("rolls the date at Indian midnight, not at UTC midnight", () => {
    // 18:45 UTC on the 4th is already 00:15 on the 5th in India. A UTC-based reading would
    // call this the 4th and mark a task due the 5th as "tomorrow" when it is due today.
    expect(istDay(new Date("2026-09-04T18:45:00Z"))).toBe("2026-09-05");
    expect(istDay(new Date("2026-09-04T18:15:00Z"))).toBe("2026-09-04");
  });

  it("reads a date input as an Indian day and writes it back unchanged", () => {
    const parsed = fromDayInput("2026-09-05");
    expect(parsed).not.toBeNull();
    expect(toDayInput(parsed)).toBe("2026-09-05");
  });

  it("rejects anything that is not a date", () => {
    expect(fromDayInput("tomorrow")).toBeNull();
    expect(fromDayInput("2026-13-45")).toBeNull();
    expect(fromDayInput("")).toBeNull();
  });

  it("counts a deadline as today for the whole of that Indian day", () => {
    const due = fromDayInput("2026-09-05")!;
    // Quarter past midnight in India, which is still the 4th in UTC.
    expect(isDueToday(due, new Date("2026-09-04T18:45:00Z"))).toBe(true);
    // Late evening in India on the same day.
    expect(isDueToday(due, new Date("2026-09-05T17:00:00Z"))).toBe(true);
    expect(isPastDue(due, new Date("2026-09-05T17:00:00Z"))).toBe(false);
  });

  it("is late only once the Indian day has actually turned", () => {
    const due = fromDayInput("2026-09-05")!;
    expect(isPastDue(due, new Date("2026-09-05T18:31:00Z"))).toBe(true);
    expect(isPastDue(due, new Date("2026-09-05T18:00:00Z"))).toBe(false);
  });

  it("has no opinion about a task with no due date", () => {
    expect(isDueToday(null)).toBe(false);
    expect(isPastDue(null)).toBe(false);
    expect(daysFromToday(null)).toBeNull();
  });

  it("counts whole days either side of today", () => {
    const now = new Date("2026-09-05T06:00:00Z");
    expect(daysFromToday(fromDayInput("2026-09-05"), now)).toBe(0);
    expect(daysFromToday(fromDayInput("2026-09-08"), now)).toBe(3);
    expect(daysFromToday(fromDayInput("2026-09-01"), now)).toBe(-4);
  });
});

describe("counting a campaign", () => {
  const now = new Date("2026-09-10T06:00:00Z");
  const past = fromDayInput("2026-09-01");
  const future = fromDayInput("2026-09-20");

  it("keeps counting someone as confirmed after they move past it", () => {
    // Counting only the exact stage would make the number fall as work progressed, which
    // reads as people dropping out of the campaign.
    const counts = countInfluencers(
      [
        { status: "CONFIRMED", deadline: future },
        { status: "PUBLISHED", deadline: future },
        { status: "CONTACTED", deadline: future },
      ],
      now,
    );
    expect(counts.confirmed).toBe(2);
  });

  it("counts published as including those already finished", () => {
    const counts = countInfluencers(
      [
        { status: "PUBLISHED", deadline: future },
        { status: "COMPLETED", deadline: future },
        { status: "APPROVED", deadline: future },
      ],
      now,
    );
    expect(counts.published).toBe(2);
    expect(counts.completed).toBe(1);
  });

  it("does not call a finished influencer overdue", () => {
    const counts = countInfluencers(
      [
        { status: "COMPLETED", deadline: past },
        { status: "CONTENT_PENDING", deadline: past },
      ],
      now,
    );
    expect(counts.overdue).toBe(1);
  });

  it("splits tasks into done, due today and late", () => {
    const counts = countTasks(
      [
        { dueDate: past, completedAt: null },
        { dueDate: fromDayInput("2026-09-10"), completedAt: null },
        { dueDate: future, completedAt: null },
        { dueDate: past, completedAt: new Date() },
        { dueDate: null, completedAt: null },
      ],
      now,
    );
    expect(counts).toEqual({ total: 5, completed: 1, dueToday: 1, overdue: 1 });
  });

  it("never counts a finished task as late, however old it is", () => {
    const counts = countTasks([{ dueDate: past, completedAt: new Date() }], now);
    expect(counts.overdue).toBe(0);
  });
});

describe("progress", () => {
  const empty = { total: 0, confirmed: 0, contentPending: 0, published: 0, completed: 0, overdue: 0 };
  const noTasks = { total: 0, completed: 0, dueToday: 0, overdue: 0 };

  it("is zero for a campaign with nothing in it, not a hundred", () => {
    expect(progressOf(empty, noTasks)).toBe(0);
  });

  it("weighs influencers and tasks together", () => {
    // Two of four influencers and one of four tasks: three of eight things done.
    expect(
      progressOf({ ...empty, total: 4, completed: 2 }, { ...noTasks, total: 4, completed: 1 }),
    ).toBe(38);
  });

  it("reaches a hundred only when everything is done", () => {
    expect(
      progressOf({ ...empty, total: 2, completed: 2 }, { ...noTasks, total: 3, completed: 3 }),
    ).toBe(100);
    expect(
      progressOf({ ...empty, total: 2, completed: 2 }, { ...noTasks, total: 3, completed: 2 }),
    ).toBe(80);
  });
});

describe("automation", () => {
  it("creates work only at the stages where somebody owes something", () => {
    expect(taskForStatus("CONFIRMED")?.name).toBe("Send brief");
    expect(taskForStatus("CONTENT_PENDING")?.name).toBe("Review content");
    expect(taskForStatus("APPROVED")?.name).toBe("Track publishing");
    expect(taskForStatus("PUBLISHED")?.name).toBe("Collect analytics");
    expect(taskForStatus("COMPLETED")?.name).toBe("Release payment");

    // Nobody owes anything before a creator has agreed.
    expect(taskForStatus("SELECTED")).toBeNull();
    expect(taskForStatus("CONTACTED")).toBeNull();
  });

  it("uses the influencer's own deadline when it is still ahead", () => {
    const now = new Date("2026-09-10T06:00:00Z");
    const deadline = fromDayInput("2026-09-15")!;
    expect(dueDateFor({ name: "Send brief", dueInDays: 2 }, deadline, now)).toEqual(deadline);
  });

  it("ignores a deadline that has already gone, rather than creating a late task", () => {
    const now = new Date("2026-09-10T06:00:00Z");
    const stale = fromDayInput("2026-09-01")!;
    const due = dueDateFor({ name: "Send brief", dueInDays: 2 }, stale, now);
    expect(isPastDue(due, now)).toBe(false);
    expect(daysFromToday(due, now)).toBe(2);
  });

  it("falls back to the template's own spacing when there is no deadline", () => {
    const now = new Date("2026-09-10T06:00:00Z");
    expect(daysFromToday(dueDateFor({ name: "x", dueInDays: 7 }, null, now), now)).toBe(7);
  });
});

describe("reading pasted accounts", () => {
  it("takes a handle written as one, and a profile link on either platform", () => {
    const parsed = parsePaste("@creator\ninstagram.com/another\nyoutube.com/@somechannel");
    expect(parsed.influencers).toEqual([
      { platform: "instagram", handle: "creator" },
      { platform: "instagram", handle: "another" },
      { platform: "youtube", handle: "@somechannel" },
    ]);
    expect(parsed.rejected).toEqual([]);
  });

  it("does not turn a sentence into influencers", () => {
    // Every word here is a legal Instagram handle, which is exactly why a bare word cannot
    // be enough: this once created influencers called "not" and "a".
    const parsed = parsePaste("not a handle");
    expect(parsed.influencers).toEqual([]);
    expect(parsed.rejected).toEqual(["not", "a", "handle"]);
  });

  it("keeps the @ on a YouTube handle and the capitals on a channel id", () => {
    // The provider tells the two apart by the "@", and a channel id's case is load-bearing.
    expect(normaliseHandle("youtube", "@MKBHD")).toBe("@mkbhd");
    expect(normaliseHandle("youtube", "UCBJycsmduvYEL83R_U4JriQ")).toBe("UCBJycsmduvYEL83R_U4JriQ");
    expect(normaliseHandle("instagram", "@SmolBiceps")).toBe("smolbiceps");
  });

  it("refuses a reel link, which names content rather than an account", () => {
    const parsed = parsePaste("https://www.instagram.com/reel/Cabc123/");
    expect(parsed.influencers).toEqual([]);
    expect(parsed.rejected).toHaveLength(1);
  });

  it("takes the owner from a reel link that carries one", () => {
    const parsed = parsePaste("https://www.instagram.com/somecreator/reel/Cabc123/");
    expect(parsed.influencers).toEqual([{ platform: "instagram", handle: "somecreator" }]);
  });

  it("does not add the same account twice however it was written", () => {
    const parsed = parsePaste("@creator\ninstagram.com/CREATOR\n@Creator");
    expect(parsed.influencers).toEqual([{ platform: "instagram", handle: "creator" }]);
  });

  it("writes a handle back the way each platform expects to see it", () => {
    expect(displayHandle("instagram", "creator")).toBe("@creator");
    expect(displayHandle("youtube", "@somechannel")).toBe("@somechannel");
  });
});

describe("payments", () => {
  it("says nothing is owed until a rate is agreed", () => {
    expect(paymentState({ agreedRate: null, amountPaid: 0 })).toBe("NO_RATE");
    expect(paymentState({ agreedRate: 0, amountPaid: 0 })).toBe("NO_RATE");
  });

  it("tells an advance apart from a settled account", () => {
    expect(paymentState({ agreedRate: 200_000, amountPaid: 0 })).toBe("UNPAID");
    expect(paymentState({ agreedRate: 200_000, amountPaid: 100_000 })).toBe("PART_PAID");
    expect(paymentState({ agreedRate: 200_000, amountPaid: 200_000 })).toBe("PAID");
  });

  it("treats paying slightly over as settled, not as still owing", () => {
    expect(paymentState({ agreedRate: 199_500, amountPaid: 200_000 })).toBe("PAID");
  });

  it("adds up what a campaign has promised and what it has handed over", () => {
    const result = money(
      [
        { agreedRate: 200_000, amountPaid: 200_000 },
        { agreedRate: 150_000, amountPaid: 75_000 },
        { agreedRate: 100_000, amountPaid: 0 },
        { agreedRate: null, amountPaid: 0 },
      ],
      500_000,
    );
    expect(result.committed).toBe(450_000);
    expect(result.paid).toBe(275_000);
    expect(result.outstanding).toBe(175_000);
    expect(result.owedTo).toBe(2);
    expect(result.overBudget).toBe(false);
  });

  it("does not let an overpayment to one creator hide what another is owed", () => {
    const result = money(
      [
        { agreedRate: 100_000, amountPaid: 150_000 },
        { agreedRate: 100_000, amountPaid: 0 },
      ],
      null,
    );
    expect(result.paid).toBe(100_000);
    expect(result.outstanding).toBe(100_000);
    expect(result.owedTo).toBe(1);
  });

  it("reports going over budget rather than pretending it cannot happen", () => {
    const result = money([{ agreedRate: 300_000, amountPaid: 0 }], 250_000);
    expect(result.overBudget).toBe(true);
  });

  it("is not over budget when no budget was recorded", () => {
    expect(money([{ agreedRate: 900_000, amountPaid: 0 }], null).overBudget).toBe(false);
  });

  it("raises a payment task when the work is done but the money is not", () => {
    const template = taskForStatus("COMPLETED");
    expect(template?.name).toBe("Release payment");
    expect(taskIsNeeded(template!, false)).toBe(true);
  });

  it("does not raise one for a creator already paid in full", () => {
    // Paying up front makes Completed and settled happen at once, and a task for money
    // already sent is exactly the noise that makes people stop trusting the list.
    expect(taskIsNeeded(taskForStatus("COMPLETED")!, true)).toBe(false);
  });

  it("leaves the other stages' tasks alone", () => {
    expect(taskIsNeeded(taskForStatus("CONFIRMED")!, true)).toBe(true);
  });
});

describe("stages", () => {
  it("runs from selected to completed in the order work happens", () => {
    expect(stageIndex("SELECTED")).toBe(0);
    expect(stageIndex("COMPLETED")).toBe(INFLUENCER_STATUSES.length - 1);
    expect(stageIndex("CONFIRMED")).toBeLessThan(stageIndex("PUBLISHED"));
  });

  it("falls back to the first stage for a value we no longer recognise", () => {
    expect(toInfluencerStatus("NEGOTIATING")).toBe("SELECTED");
    expect(toInfluencerStatus("PUBLISHED")).toBe("PUBLISHED");
  });
});
