"use client";

import { DueDate } from "@/components/campaigns/bits";
import { IconAlert, IconBriefcase, IconCheck, IconClock } from "@/components/icons";
import type { MyWork } from "@/lib/campaigns/types";

type Props = {
  work: MyWork | null;
  onOpenCampaign: (id: string) => void;
  onComplete: (campaignId: string, taskId: string, name: string) => void;
  busy: boolean;
};

/**
 * What is on this person right now.
 *
 * Overdue comes before due-today deliberately: the thing already missed is the thing worth
 * interrupting someone with, and burying it under today's list is how it stays missed.
 */
export default function MyWorkPanel({ work, onOpenCampaign, onComplete, busy }: Props) {
  if (!work) {
    return (
      <div className="card space-y-2.5 p-4">
        <div className="skeleton h-4 w-28" />
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-10 w-full" />
      </div>
    );
  }

  const nothing = work.overdue.length === 0 && work.dueToday.length === 0;

  return (
    <div className="card overflow-hidden">
      <div className="card-head">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-indigo-50 text-indigo-600">
            <IconClock className="h-3.5 w-3.5" />
          </span>
          <p className="text-sm font-semibold">My work</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {work.overdue.length > 0 ? (
            <span className="chip bg-rose-50 text-rose-700 ring-rose-200/70">
              {work.overdue.length} overdue
            </span>
          ) : null}
          {work.dueToday.length > 0 ? (
            <span className="chip bg-amber-50 text-amber-700 ring-amber-200/70">
              {work.dueToday.length} due today
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <IconBriefcase className="h-3.5 w-3.5 text-slate-400" />
            {work.activeCampaigns} active
          </span>
        </div>
      </div>

      {nothing ? (
        <div className="flex flex-col items-center gap-1.5 px-4 py-9 text-center">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <IconCheck className="h-4 w-4" />
          </span>
          <p className="text-sm font-medium text-slate-700">You are all clear.</p>
          <p className="text-[13px] text-slate-500">Nothing due today, and nothing late.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {[...work.overdue, ...work.dueToday].map((task) => (
            <li
              key={task.id}
              className="group flex flex-wrap items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50/70"
            >
              {/* Same trick as the task list: the square stays 18px, the target does not. */}
              <button
                className="relative grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border border-slate-300 bg-white text-transparent transition before:absolute before:-inset-2.5 before:content-[''] hover:border-emerald-500 hover:bg-emerald-500 hover:text-white disabled:opacity-40"
                disabled={busy}
                title="Mark done"
                aria-label={`Mark ${task.name} done`}
                onClick={() => onComplete(task.campaign.id, task.id, task.name)}
              >
                <IconCheck className="h-3 w-3" />
              </button>

              {/* First line to the task, second to the campaign and the date — a phone has
                  no room for all three side by side and the name is the one you read. */}
              <div className="w-[calc(100%-1.875rem)] flex-none sm:w-auto sm:min-w-0 sm:flex-1">
                <p className="text-[13px] font-medium leading-tight sm:truncate">{task.name}</p>
                <button
                  className="mt-0.5 block max-w-full truncate text-left text-[12px] leading-tight text-slate-500 transition-colors hover:text-indigo-600"
                  onClick={() => onOpenCampaign(task.campaign.id)}
                >
                  {task.campaign.name}
                </button>
              </div>

              <span className="ml-[1.875rem] flex items-center gap-1.5 text-xs sm:ml-0">
                {task.state === "OVERDUE" ? (
                  <IconAlert className="h-3.5 w-3.5 text-rose-500" />
                ) : null}
                <DueDate iso={task.dueDate} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
