"use client";

import { IconAlert, IconCheck } from "@/components/icons";
import { DueDate } from "@/components/campaigns/bits";
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
      <div className="card space-y-2 p-4">
        <div className="skeleton h-5 w-32" />
        <div className="skeleton h-9 w-full" />
        <div className="skeleton h-9 w-full" />
      </div>
    );
  }

  const nothing = work.overdue.length === 0 && work.dueToday.length === 0;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-semibold">My work</p>
        <div className="flex flex-wrap gap-1.5">
          {work.overdue.length > 0 ? (
            <span className="chip bg-rose-50 text-rose-700 ring-rose-200">
              {work.overdue.length} overdue
            </span>
          ) : null}
          {work.dueToday.length > 0 ? (
            <span className="chip bg-amber-50 text-amber-700 ring-amber-200">
              {work.dueToday.length} due today
            </span>
          ) : null}
          <span className="chip bg-slate-100 text-slate-600 ring-slate-200">
            {work.activeCampaigns} active {work.activeCampaigns === 1 ? "campaign" : "campaigns"}
          </span>
        </div>
      </div>

      {nothing ? (
        <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-500">
          <IconCheck className="h-4 w-4 text-emerald-500" />
          Nothing due today, and nothing late.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {[...work.overdue, ...work.dueToday].map((task) => (
            <li key={task.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <button
                className="grid h-5 w-5 shrink-0 place-items-center rounded border border-slate-300 text-transparent transition hover:border-emerald-500 hover:text-emerald-600"
                disabled={busy}
                title="Mark done"
                onClick={() => onComplete(task.campaign.id, task.id, task.name)}
              >
                <IconCheck className="h-3.5 w-3.5" />
              </button>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{task.name}</p>
                <button
                  className="text-xs text-slate-500 hover:text-indigo-600 hover:underline"
                  onClick={() => onOpenCampaign(task.campaign.id)}
                >
                  {task.campaign.name}
                </button>
              </div>

              <span className="flex items-center gap-1.5 text-xs">
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
