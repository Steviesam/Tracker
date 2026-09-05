"use client";

/**
 * The whole working day on one screen.
 *
 * The order down the page is the order somebody needs it: what is late, what is on today,
 * what is finished, and only then what is coming. A manager gets a second tab for the team,
 * built from the same rows — nobody reports anything to anybody, the counts are the tasks.
 *
 * The day itself is polled above this component, because a deadline warning has to reach
 * somebody who is looking at a different section.
 */

import { useCallback, useEffect, useState } from "react";
import { Stat } from "@/components/campaigns/bits";
import { IconAlert, IconChecklist, IconClock, IconPlus, IconRefresh } from "@/components/icons";
import AssignTask, { type NewTaskInput } from "@/components/tasks/assign-task";
import TaskRow, { type TaskAction } from "@/components/tasks/task-row";
import TeamPanel from "@/components/tasks/team-panel";
import type { DayState } from "@/components/tasks/use-day";
import type { NoticeTone } from "@/components/toast";
import { formatTimeOfDay } from "@/lib/format";
import type { Insights, MyDay, TaskItem, TeamToday } from "@/lib/tasks/types";

type Props = {
  meId: string;
  state: DayState;
  onNotify: (message: string, tone?: NoticeTone) => void;
  onOpenCampaign: (campaignId: string) => void;
};

/** How often the running timers redraw. Once a second, and only in the browser. */
const TICK_MS = 1_000;

export default function TasksSection({ meId, state, onNotify, onOpenCampaign }: Props) {
  const { day, people, canRunTheFloor, loading, outstanding, refresh, apply } = state;

  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string; brand: string }>>([]);
  const [team, setTeam] = useState<{ today: TeamToday; insights: Insights } | null>(null);
  const [tab, setTab] = useState<"mine" | "team">("mine");
  const [assigning, setAssigning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const loadTeam = useCallback(async () => {
    try {
      const response = await fetch("/api/team");
      if (!response.ok) return;
      const body = await response.json();
      setTeam({ today: body.today, insights: body.insights });
    } catch {
      // The team tab is extra; failing to load it should not disturb somebody's own list.
    }
  }, []);

  // Campaigns are only needed to attach a task to one, so they are fetched for the people
  // who can assign — a member never sees the picker.
  useEffect(() => {
    if (!canRunTheFloor) return;
    void fetch("/api/campaigns")
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!body?.campaigns) return;
        setCampaigns(
          body.campaigns.map((row: { id: string; name: string; brand: string }) => ({
            id: row.id,
            name: row.name,
            brand: row.brand,
          })),
        );
      })
      .catch(() => undefined);
  }, [canRunTheFloor]);

  useEffect(() => {
    if (tab === "team" && canRunTheFloor) void loadTeam();
  }, [tab, canRunTheFloor, loadTeam]);

  // The clock, for the running timers and the countdowns.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const send = useCallback(
    async (taskId: string, body: Record<string, unknown>, failure: string) => {
      setBusy(true);
      try {
        const response = await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          onNotify(payload.error ?? failure, "error");
          return false;
        }
        apply(payload.day);
        if (tab === "team") void loadTeam();
        return true;
      } catch {
        onNotify(failure, "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onNotify, apply, tab, loadTeam],
  );

  const onAction = useCallback(
    async (task: TaskItem, action: TaskAction) => {
      const ok = await send(task.id, { action }, "Could not update that task.");
      if (!ok) return;
      if (action === "start") onNotify(`Started ${task.name}. The clock is running.`);
      if (action === "complete") onNotify(`Completed ${task.name}.`);
    },
    [send, onNotify],
  );

  const onNote = useCallback(
    async (task: TaskItem, note: string) => {
      const ok = await send(task.id, { action: "note", note }, "Could not save that reason.");
      if (ok) onNotify("Reason saved.");
    },
    [send, onNotify],
  );

  const onDelete = useCallback(
    async (task: TaskItem) => {
      setBusy(true);
      try {
        const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          onNotify(payload.error ?? "Could not delete that task.", "error");
          return;
        }
        apply(payload.day);
        if (tab === "team") void loadTeam();
        onNotify(`Deleted ${task.name}.`);
      } finally {
        setBusy(false);
      }
    },
    [onNotify, apply, tab, loadTeam],
  );

  const onAssign = useCallback(
    async (input: NewTaskInput) => {
      setBusy(true);
      try {
        const response = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: input.name,
            description: input.description || undefined,
            brand: input.brand || undefined,
            priority: input.priority,
            assignedToId: input.assignedToId,
            campaignId: input.campaignId || undefined,
            dueDay: input.dueDay || undefined,
            dueTime: input.dueTime || undefined,
            reminderMinutes: input.reminderMinutes ?? undefined,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          onNotify(payload.error ?? "Could not assign that task.", "error");
          return;
        }
        apply(payload.day);
        setAssigning(false);
        if (tab === "team") void loadTeam();
        const who = people.find((person) => person.id === input.assignedToId);
        onNotify(
          input.assignedToId === meId
            ? `Added ${input.name} to your list.`
            : `Assigned ${input.name} to ${who?.name ?? "them"}.`,
        );
      } finally {
        setBusy(false);
      }
    },
    [onNotify, apply, people, meId, tab, loadTeam],
  );

  if (!day) return <Skeleton />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {canRunTheFloor ? (
          <div className="segment rail">
            <button
              className={`segment-item ${tab === "mine" ? "segment-item-on" : ""}`}
              onClick={() => setTab("mine")}
            >
              My tasks
              {outstanding > 0 ? (
                <span className="ml-1.5 tabular-nums opacity-70">{outstanding}</span>
              ) : null}
            </button>
            <button
              className={`segment-item ${tab === "team" ? "segment-item-on" : ""}`}
              onClick={() => setTab("team")}
            >
              Team
            </button>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-[13px] text-slate-500">
            <IconClock className="h-3.5 w-3.5 text-slate-400" />
            {day.signedInAt
              ? `Signed in at ${formatTimeOfDay(day.signedInAt)}`
              : "Signed in just now"}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            className="btn btn-sm"
            disabled={loading}
            onClick={() => {
              void refresh();
              if (tab === "team") void loadTeam();
            }}
            title="Reload"
          >
            <IconRefresh className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          {canRunTheFloor ? (
            <button className="btn btn-primary btn-sm" onClick={() => setAssigning(true)}>
              <IconPlus className="h-3.5 w-3.5" />
              Assign task
            </button>
          ) : null}
        </div>
      </div>

      {assigning ? (
        <AssignTask
          people={people}
          campaigns={campaigns}
          meId={meId}
          busy={busy}
          onSubmit={(input) => void onAssign(input)}
          onClose={() => setAssigning(false)}
        />
      ) : null}

      {tab === "team" && canRunTheFloor ? (
        team ? (
          <TeamPanel
            team={team.today}
            insights={team.insights}
            now={now}
            busy={busy}
            meId={meId}
            onAction={(task, action) => void onAction(task, action)}
            onNote={(task, note) => void onNote(task, note)}
            onOpenCampaign={onOpenCampaign}
          />
        ) : (
          <Skeleton />
        )
      ) : (
        <MyDayPanel
          day={day}
          now={now}
          busy={busy}
          canRunTheFloor={canRunTheFloor}
          onAction={(task, action) => void onAction(task, action)}
          onNote={(task, note) => void onNote(task, note)}
          onDelete={(task) => void onDelete(task)}
          onOpenCampaign={onOpenCampaign}
        />
      )}
    </div>
  );
}

function MyDayPanel({
  day,
  now,
  busy,
  canRunTheFloor,
  onAction,
  onNote,
  onDelete,
  onOpenCampaign,
}: {
  day: MyDay;
  now: number;
  busy: boolean;
  canRunTheFloor: boolean;
  onAction: (task: TaskItem, action: TaskAction) => void;
  onNote: (task: TaskItem, note: string) => void;
  onDelete: (task: TaskItem) => void;
  onOpenCampaign: (campaignId: string) => void;
}) {
  // Counted off the clock rather than the state, so a late task somebody is in the middle
  // of shows up here as well as under Overdue. It is being worked on either way.
  const running = [...day.overdue, ...day.today].filter(
    (task) => task.startedAt && !task.completedAt,
  ).length;
  const nothingAtAll =
    day.overdue.length === 0 &&
    day.today.length === 0 &&
    day.upcoming.length === 0 &&
    day.completedToday.length === 0;

  const list = (tasks: TaskItem[]) => (
    <ul>
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          now={now}
          busy={busy}
          mine
          canRunTheFloor={canRunTheFloor}
          onAction={onAction}
          onNote={onNote}
          onDelete={onDelete}
          onOpenCampaign={onOpenCampaign}
        />
      ))}
    </ul>
  );

  if (nothingAtAll) {
    return (
      <div className="card grid place-items-center px-6 py-16 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-400">
          <IconChecklist className="h-5 w-5" />
        </span>
        <p className="mt-3 text-[15px] font-semibold">Nothing assigned to you</p>
        <p className="mt-1 max-w-sm text-[13px] text-slate-500">
          When your manager assigns work it appears here, most important first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Due today" value={day.today.length} />
        <Stat label="In progress" value={running} />
        <Stat
          label="Overdue"
          value={day.overdue.length}
          tone={day.overdue.length > 0 ? "warn" : "plain"}
        />
        <Stat label="Done today" value={day.completedToday.length} tone="good" />
      </section>

      {day.overdue.length > 0 ? (
        <section className="card overflow-hidden ring-1 ring-rose-200/70">
          {/* `justify-start` beats the class's own `justify-between`, which would otherwise
              push the heading away from the icon that introduces it. */}
          <div className="card-head justify-start gap-2 bg-rose-50/60">
            <IconAlert className="h-4 w-4 shrink-0 text-rose-500" />
            <div>
              <h3 className="text-[15px] font-semibold leading-tight text-rose-900">
                Overdue · {day.overdue.length}
              </h3>
              <p className="mt-0.5 text-[13px] text-rose-700/80">
                These stay here until they are done. Add a reason if something is blocking you.
              </p>
            </div>
          </div>
          {list(day.overdue)}
        </section>
      ) : null}

      <section className="card overflow-hidden">
        {/* `card-head` spreads its children apart, so a heading and its strapline have to
            arrive as one block or the strapline lands against the far edge. */}
        <div className="card-head">
          <div>
            <h3 className="text-[15px] font-semibold leading-tight">
              Today
              {day.today.length > 0 ? (
                <span className="ml-1.5 text-slate-400">{day.today.length}</span>
              ) : null}
            </h3>
            <p className="mt-0.5 text-[13px] text-slate-500">
              High priority first, then by deadline. Start one and the clock runs.
            </p>
          </div>
        </div>
        {day.today.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-slate-500">
            Nothing left for today.
          </p>
        ) : (
          list(day.today)
        )}
      </section>

      {day.completedToday.length > 0 ? (
        <section className="card overflow-hidden">
          <div className="card-head">
            <div>
              <h3 className="text-[15px] font-semibold leading-tight">
                Completed today
                <span className="ml-1.5 text-slate-400">{day.completedToday.length}</span>
              </h3>
            </div>
          </div>
          {list(day.completedToday)}
        </section>
      ) : null}

      {day.upcoming.length > 0 ? (
        <section className="card overflow-hidden">
          <div className="card-head">
            <div>
              <h3 className="text-[15px] font-semibold leading-tight">Coming up</h3>
              <p className="mt-0.5 text-[13px] text-slate-500">
                The next week, so nothing arrives as a surprise.
              </p>
            </div>
          </div>
          {list(day.upcoming)}
        </section>
      ) : null}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="skeleton h-[74px] rounded-xl" />
        ))}
      </div>
      <div className="skeleton h-64 rounded-2xl" />
    </div>
  );
}
