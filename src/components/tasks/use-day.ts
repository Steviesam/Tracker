"use client";

/**
 * The signed-in person's day, kept fresh for the whole app.
 *
 * This lives above the Tasks section rather than inside it because two of the things it
 * does are not about that screen. A deadline warning has to reach somebody who has been
 * reading Discovery all afternoon, and the count on the navigation has to be right before
 * anybody opens the tab it is attached to. Both would be impossible from a component that
 * only exists while its own section is on screen.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { formatTimeOfDay } from "@/lib/format";
import type { Person } from "@/lib/campaigns/types";
import type { MyDay } from "@/lib/tasks/types";

/**
 * How often the day is re-read.
 *
 * A minute. Deadlines are set to the minute, so a warning up to a minute late is still a
 * warning, and anything more frequent is a request every few seconds for a screen that
 * changes when somebody presses a button on it.
 */
const POLL_MS = 60_000;

export type DayState = {
  day: MyDay | null;
  people: Person[];
  canRunTheFloor: boolean;
  loading: boolean;
  /** Overdue plus today: the work that is actually outstanding. */
  outstanding: number;
  refresh: () => Promise<void>;
  /** Applies the day a mutation returned, so the list updates without a second request. */
  apply: (day: MyDay) => void;
};

export function useDay(
  notify: (message: string, tone?: "success" | "error" | "info") => void,
): DayState {
  const [day, setDay] = useState<MyDay | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [canRunTheFloor, setCanRunTheFloor] = useState(false);
  const [loading, setLoading] = useState(true);

  // Warnings already shown in this tab. The server's `remindedAt` stops them returning
  // after a reload; this stops the same one appearing twice between two polls.
  const shown = useRef(new Set<string>());
  // Held in a ref so the poll does not restart every time the callback identity changes,
  // which would reset the interval and, on a busy screen, mean it never fires.
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const read = useCallback(async (quiet: boolean) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/tasks");
      if (!response.ok) {
        if (!quiet) notifyRef.current("Could not load your tasks.", "error");
        return;
      }
      const body = await response.json();
      setDay(body.day);
      setPeople(body.people ?? []);
      setCanRunTheFloor(Boolean(body.canRunTheFloor));
    } catch {
      if (!quiet) notifyRef.current("Could not load your tasks.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void read(false);
    const id = window.setInterval(() => void read(true), POLL_MS);
    return () => window.clearInterval(id);
  }, [read]);

  /**
   * The warning, once each.
   *
   * Shown as the app's own notice rather than a browser notification: that needs a
   * permission prompt, is refused by most people asked, and would arrive when the tab is
   * closed — which is exactly when nobody can act on it.
   */
  useEffect(() => {
    if (!day) return;
    for (const task of day.reminders) {
      if (shown.current.has(task.id)) continue;
      shown.current.add(task.id);

      const late = task.millisLeft !== null && task.millisLeft < 0;
      notifyRef.current(
        late
          ? `Overdue: ${task.name}`
          : `Deadline soon: ${task.name}${
              task.dueDate && task.dueHasTime ? ` at ${formatTimeOfDay(task.dueDate)}` : ""
            }`,
        late ? "error" : "info",
      );

      // Tells the server it has been said, so tomorrow's session does not say it again.
      void fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reminded" }),
      }).catch(() => undefined);
    }
  }, [day]);

  return {
    day,
    people,
    canRunTheFloor,
    loading,
    outstanding: day ? day.overdue.length + day.today.length : 0,
    refresh: useCallback(() => read(false), [read]),
    apply: useCallback((next: MyDay) => setDay(next), []),
  };
}
