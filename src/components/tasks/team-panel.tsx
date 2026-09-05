"use client";

/**
 * The floor, for whoever is running it.
 *
 * Three questions in the order a manager asks them: how is the team doing overall, who is
 * behind, and where is the time going. Nothing here needs anybody to report anything — it
 * is the same rows the employees are ticking off, counted.
 */

import { Avatar, Stat } from "@/components/campaigns/bits";
import { IconAlert, IconClock } from "@/components/icons";
import TaskRow, { type TaskAction } from "@/components/tasks/task-row";
import { formatDuration, formatTimeOfDay } from "@/lib/format";
import type { Insights, TaskItem, TeamToday } from "@/lib/tasks/types";

type Props = {
  team: TeamToday;
  insights: Insights;
  now: number;
  busy: boolean;
  meId: string;
  onAction: (task: TaskItem, action: TaskAction) => void;
  onNote: (task: TaskItem, note: string) => void;
  onOpenCampaign?: (campaignId: string) => void;
};

export default function TeamPanel({
  team,
  insights,
  now,
  busy,
  meId,
  onAction,
  onNote,
  onOpenCampaign,
}: Props) {
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <Stat label="Tasks today" value={team.counts.total} />
        <Stat label="Completed" value={team.counts.completed} tone="good" />
        <Stat label="In progress" value={team.counts.inProgress} />
        <Stat label="Pending" value={team.counts.pending} />
        <Stat
          label="Overdue"
          value={team.counts.overdue}
          tone={team.counts.overdue > 0 ? "warn" : "plain"}
        />
      </section>

      <section className="card">
        {/* `card-head` spreads its children apart, so a heading and its strapline have to
            arrive as one block or the strapline lands against the far edge. */}
        <div className="card-head">
          <div>
            <h3 className="text-[15px] font-semibold leading-tight">Who is doing what</h3>
            <p className="mt-0.5 text-[13px] text-slate-500">
              Everyone with an account, and the work on them right now.
            </p>
          </div>
        </div>

        <ul className="divide-y divide-slate-100">
          {team.people.map((row) => (
            <li key={row.person.id} className="px-4 py-3">
              {/*
                Name and attendance on one line, the counts on the next.
                Sharing a row on a phone squeezed the name column to a couple of characters
                and turned "in at 8:55 am" into one word per line.
              */}
              <div className="flex items-center gap-3">
                <Avatar name={row.person.name} className="h-8 w-8 text-[11px]" />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium leading-tight">
                    {row.person.name}
                    {row.person.id === meId ? (
                      <span className="ml-1.5 text-[12px] font-normal text-slate-400">you</span>
                    ) : null}
                  </p>
                  {/*
                    When they arrived, and nothing else. No idle time, no activity graph —
                    the request asked for basic attendance and explicitly not for
                    monitoring, and a figure that invited staring at it would get stared at.
                  */}
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-slate-500">
                    {row.signedInAt ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <IconClock className="h-3 w-3 shrink-0 text-slate-400" />
                        in at {formatTimeOfDay(row.signedInAt)}
                        {row.signedOutAt ? `, out ${formatTimeOfDay(row.signedOutAt)}` : ""}
                      </span>
                    ) : (
                      <span className="text-slate-400">Not signed in today</span>
                    )}
                    {row.millisAtWork !== null ? (
                      <span className="whitespace-nowrap text-slate-400">
                        · {formatDuration(row.millisAtWork)}
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>

              {/* The one line the request asked for, in the order it asked for it. */}
              <p className="ml-11 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] tabular-nums sm:mt-1">
                {row.counts.total === 0 ? (
                  // All zeros read as a fault rather than as an empty afternoon.
                  <span className="text-slate-400">Nothing assigned</span>
                ) : (
                  <>
                    <span className="font-medium text-slate-700">
                      {row.counts.total} {row.counts.total === 1 ? "task" : "tasks"}
                    </span>
                    <span className="text-emerald-600">{row.counts.completed} done</span>
                    {row.counts.inProgress > 0 ? (
                      <span className="text-sky-600">{row.counts.inProgress} running</span>
                    ) : null}
                    <span className="text-slate-500">{row.counts.pending} pending</span>
                    {row.counts.overdue > 0 ? (
                      <span className="font-medium text-rose-600">
                        {row.counts.overdue} overdue
                      </span>
                    ) : null}
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        {/* `justify-start` beats the class's own `justify-between`, which would otherwise
            push the heading away from the icon that introduces it. */}
        <div className="card-head justify-start gap-2">
          <IconAlert
            className={`h-4 w-4 ${team.overdue.length > 0 ? "text-rose-500" : "text-slate-300"}`}
          />
          <div>
            <h3 className="text-[15px] font-semibold leading-tight">
              Overdue across the team
              {team.overdue.length > 0 ? (
                <span className="ml-1.5 text-rose-600">{team.overdue.length}</span>
              ) : null}
            </h3>
            <p className="mt-0.5 text-[13px] text-slate-500">
              Worst first. These stay here until they are done.
            </p>
          </div>
        </div>

        {team.overdue.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-slate-500">
            Nothing is late. The whole team is on time.
          </p>
        ) : (
          <ul>
            {team.overdue.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                now={now}
                busy={busy}
                mine={task.assignedTo?.id === meId}
                canRunTheFloor
                onAction={onAction}
                onNote={onNote}
                onOpenCampaign={onOpenCampaign}
              />
            ))}
          </ul>
        )}
      </section>

      <Productivity insights={insights} />
    </div>
  );
}

/**
 * Where the time is going.
 *
 * Two tables and no score. A score would rank people, and the request said not to build
 * one; it would also be the wrong answer, because the useful finding here is almost never
 * "Rahul is slow" and almost always "this job takes three hours and we keep giving it one".
 */
function Productivity({ insights }: { insights: Insights }) {
  const { perPerson, slowest, totals } = insights;

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h3 className="text-[15px] font-semibold leading-tight">Where the time went</h3>
          <p className="mt-0.5 text-[13px] text-slate-500">
            Last two weeks · {totals.completed} completed · {formatDuration(totals.totalMillis)}{" "}
            tracked
          </p>
        </div>
      </div>

      {perPerson.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-slate-500">
          Nothing has been completed yet. Numbers appear here once work starts being ticked off.
        </p>
      ) : (
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div>
            <p className="label mb-2">Per person</p>
            <ul className="space-y-1.5">
              {perPerson.map((row) => (
                <li
                  key={row.person.id}
                  className="flex items-center gap-2.5 rounded-lg bg-slate-50/70 px-3 py-2"
                >
                  <Avatar name={row.person.name} className="h-6 w-6 text-[10px]" />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{row.person.name}</span>
                  <span className="shrink-0 text-[12px] tabular-nums text-slate-500">
                    {row.completed} done
                    {row.averageMillis !== null ? (
                      <span className="text-slate-400">
                        {" "}
                        · {formatDuration(row.averageMillis)} avg
                      </span>
                    ) : null}
                    {row.overdue > 0 ? (
                      <span className="font-medium text-rose-600"> · {row.overdue} late</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="label mb-2">Jobs that keep running late</p>
            {slowest.length === 0 ? (
              <p className="rounded-lg bg-slate-50/70 px-3 py-3 text-[13px] text-slate-500">
                Nothing has run late in this window.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {slowest.map((row) => (
                  <li
                    key={row.name}
                    className="flex items-center gap-2.5 rounded-lg bg-slate-50/70 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px]">{row.name}</span>
                    <span className="shrink-0 text-[12px] tabular-nums text-slate-500">
                      {row.lateTimes} of {row.times} late
                      {row.averageMillis !== null ? (
                        <span className="text-slate-400">
                          {" "}
                          · {formatDuration(row.averageMillis)} avg
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
