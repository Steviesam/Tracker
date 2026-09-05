"use client";

/**
 * One task, as the person holding it sees it.
 *
 * Everything that decides what to do next is on the closed row — priority, name, who it is
 * for, the deadline, and the one button that moves it along. The description, the note and
 * the timings are behind a click, because fifteen rows of them is a wall of text and the
 * question the screen answers is "what am I doing now", not "tell me everything".
 */

import { useState } from "react";
import { Avatar } from "@/components/campaigns/bits";
import { IconCheck, IconChevron, IconNote, IconPlay, IconTrash } from "@/components/icons";
import { Deadline, PriorityBadge, RunningFor, StateBadge, TimeTaken } from "@/components/tasks/bits";
import type { TaskItem } from "@/lib/tasks/types";

export type TaskAction = "start" | "complete" | "reopen";

type Props = {
  task: TaskItem;
  /** Ticking milliseconds, so a running task's clock moves. */
  now: number;
  busy: boolean;
  /** True when this row belongs to the person reading it. */
  mine: boolean;
  canRunTheFloor: boolean;
  onAction: (task: TaskItem, action: TaskAction) => void;
  onNote: (task: TaskItem, note: string) => void;
  onDelete?: (task: TaskItem) => void;
  onOpenCampaign?: (campaignId: string) => void;
};

export default function TaskRow({
  task,
  now,
  busy,
  mine,
  canRunTheFloor,
  onAction,
  onNote,
  onDelete,
  onOpenCampaign,
}: Props) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(task.note ?? "");

  const done = task.state === "COMPLETED";
  // Read from the clock, not the badge. A task started after its deadline still reads
  // "Overdue" — deliberately — so keying off the state would offer Start on something that
  // is already running and hide the timer that is ticking.
  const running = Boolean(task.startedAt) && !done;

  /**
   * The controls, rendered in one of two places.
   *
   * On a wide screen they sit at the end of the row. On a phone they drop to a line of
   * their own underneath: sharing the row there left the task name a column two words wide,
   * so "Send the brief to confirmed creators" arrived as four stacked fragments.
   */
  const actions = (
    <>
      {!done && !running && mine ? (
        <button
          className="btn btn-sm"
          disabled={busy}
          onClick={() => onAction(task, "start")}
          title="Start the timer"
        >
          <IconPlay className="h-3.5 w-3.5" />
          Start
        </button>
      ) : null}

      {/* "In progress" is dropped because the running clock beside the deadline already
          says it; "Overdue" is kept even while running, since that is the whole point. */}
      {!done && task.state !== "IN_PROGRESS" ? <StateBadge state={task.state} /> : null}

      <button
        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        aria-expanded={open}
        aria-label={open ? "Hide details" : "Show details"}
        onClick={() => setOpen((value) => !value)}
      >
        <IconChevron className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    </>
  );

  return (
    <li
      className={`border-b border-slate-100 last:border-b-0 ${
        task.state === "OVERDUE" ? "bg-rose-50/40" : ""
      }`}
    >
      <div className="flex items-start gap-3 px-3 py-3 sm:px-4">
        {/* The square stays small; the target around it does not, so a thumb can hit it. */}
        <button
          className={`relative mt-0.5 grid h-[20px] w-[20px] shrink-0 place-items-center rounded-[6px] border transition before:absolute before:-inset-2.5 before:content-[''] disabled:opacity-40 ${
            done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-slate-300 bg-white text-transparent hover:border-emerald-500 hover:bg-emerald-500 hover:text-white"
          }`}
          disabled={busy || (!mine && !canRunTheFloor)}
          title={done ? "Put it back" : "Mark completed"}
          aria-label={done ? `Reopen ${task.name}` : `Complete ${task.name}`}
          onClick={() => onAction(task, done ? "reopen" : "complete")}
        >
          <IconCheck className="h-3.5 w-3.5" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <PriorityBadge priority={task.priority} />
            <p
              className={`text-[13.5px] font-medium leading-snug ${
                done ? "text-slate-400 line-through" : "text-slate-900"
              }`}
            >
              {task.name}
            </p>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px]">
            {task.brand ? (
              <span className="font-medium text-slate-600">{task.brand}</span>
            ) : null}
            {task.campaign ? (
              <button
                className="truncate text-slate-500 transition-colors hover:text-indigo-600"
                onClick={() => onOpenCampaign?.(task.campaign!.id)}
                title="Open the campaign"
              >
                {task.campaign.name}
              </button>
            ) : null}
            <Deadline
              iso={task.dueDate}
              hasTime={task.dueHasTime}
              millisLeft={task.millisLeft}
              done={done}
            />
            {running ? <RunningFor since={task.startedAt!} now={now} /> : null}
            {done ? (
              <TimeTaken
                startedAt={task.startedAt}
                completedAt={task.completedAt}
                millisSpent={task.millisSpent}
              />
            ) : null}
          </div>

          {/* Whose it is, shown only to somebody who can see other people's rows — on your
              own list it would be your own name on every line. */}
          {canRunTheFloor && task.assignedTo && !mine ? (
            <div className="mt-1.5 flex items-center gap-1.5">
              <Avatar name={task.assignedTo.name} className="h-5 w-5 text-[9px]" />
              <span className="truncate text-[12px] text-slate-500">{task.assignedTo.name}</span>
            </div>
          ) : null}

          {task.note && !open ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-snug text-slate-500">
              <IconNote className="mt-[1px] h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="line-clamp-2">{task.note}</span>
            </p>
          ) : null}

          <div className="mt-2 flex items-center gap-2 sm:hidden">{actions}</div>
        </div>

        <div className="hidden shrink-0 items-center gap-1 sm:flex">{actions}</div>
      </div>

      {open ? (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-3 py-3 sm:px-4">
          {task.description ? (
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">
              {task.description}
            </p>
          ) : (
            <p className="text-[13px] text-slate-400">No description.</p>
          )}

          <dl className="grid gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-2">
            {task.assignedBy ? (
              <div className="flex gap-1.5">
                <dt className="text-slate-400">Assigned by</dt>
                <dd className="text-slate-600">{task.assignedBy.name}</dd>
              </div>
            ) : null}
            {task.assignedTo ? (
              <div className="flex gap-1.5">
                <dt className="text-slate-400">Assigned to</dt>
                <dd className="text-slate-600">{task.assignedTo.name}</dd>
              </div>
            ) : null}
          </dl>

          {/*
            Why it ran long, in their own words.

            Offered on every task rather than only on late ones: a task that is going to
            overrun is known to be going to overrun long before the deadline proves it, and
            the moment somebody knows is the moment they should be able to say so.
          */}
          <div>
            <label className="label mb-1 block" htmlFor={`note-${task.id}`}>
              Reason or blocker
            </label>
            <textarea
              id={`note-${task.id}`}
              className="field min-h-[64px] resize-y"
              placeholder="What held this up? e.g. influencer data was missing, had to verify by hand"
              value={note}
              maxLength={500}
              disabled={busy || (!mine && !canRunTheFloor)}
              onChange={(event) => setNote(event.target.value)}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                className="btn btn-sm"
                disabled={busy || note === (task.note ?? "")}
                onClick={() => onNote(task, note)}
              >
                Save reason
              </button>
              {onDelete && canRunTheFloor ? (
                <button
                  className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  title="Delete this task"
                  aria-label={`Delete ${task.name}`}
                  disabled={busy}
                  onClick={() => onDelete(task)}
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}
