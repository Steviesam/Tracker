"use client";

import { useMemo, useState } from "react";
import { Avatar, DueDate } from "@/components/campaigns/bits";
import type { ConfirmRequest } from "@/components/confirm";
import { IconCheck, IconPlus, IconTrash } from "@/components/icons";
import type { NoticeTone } from "@/components/toast";
import type { Person, TaskView } from "@/lib/campaigns/types";

type Send = (path: string, init: RequestInit, fallback: string) => Promise<unknown>;

type Props = {
  campaignId: string;
  meId: string;
  tasks: TaskView[];
  people: Person[];
  busy: boolean;
  onSend: Send;
  onNotify: (message: string, tone?: NoticeTone) => void;
  onConfirm: (request: ConfirmRequest) => void;
};

export default function TaskList({
  campaignId,
  meId,
  tasks,
  people,
  busy,
  onSend,
  onNotify,
  onConfirm,
}: Props) {
  const [name, setName] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [mineOnly, setMineOnly] = useState(false);

  const visible = useMemo(
    () => (mineOnly ? tasks.filter((task) => task.assignedTo?.id === meId) : tasks),
    [tasks, mineOnly, meId],
  );

  const open = visible.filter((task) => task.state !== "COMPLETED");
  const done = visible.filter((task) => task.state === "COMPLETED");
  const mineCount = tasks.filter((task) => task.assignedTo?.id === meId).length;

  function setCompleted(task: TaskView, completed: boolean) {
    return (async () => {
      await onSend(
        `/api/campaigns/${campaignId}/tasks`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: task.id, completed }),
        },
        "Could not update that task.",
      );
      if (completed) onNotify(`Done — ${task.name}`);
    })();
  }

  function deleteTask(task: TaskView) {
    onConfirm({
      title: "Delete this task?",
      body: `"${task.name}" will be removed from the campaign. Marking it done instead keeps it in the history.`,
      action: "Delete task",
      onConfirm: () => {
        void onSend(
          `/api/campaigns/${campaignId}/tasks?taskId=${task.id}`,
          { method: "DELETE" },
          "Could not delete that task.",
        );
      },
    });
  }

  return (
    <div className="space-y-3">
      <div className="card p-4">
        <p className="text-sm font-semibold">Add a task</p>
        <p className="mt-0.5 text-sm text-slate-500">
          Most tasks appear on their own as influencers move stage. This is for the rest.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="field min-w-[180px] flex-1"
            placeholder="Chase the brand for approval"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && name.trim()) void add();
            }}
          />
          <select
            className="field w-auto"
            value={assignedToId}
            aria-label="Assign to"
            onChange={(event) => setAssignedToId(event.target.value)}
          >
            <option value="">Assign to me</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <input
            className="field w-auto"
            type="date"
            value={dueDate}
            aria-label="Due date"
            onChange={(event) => setDueDate(event.target.value)}
          />
          <button
            className="btn-primary"
            disabled={busy || name.trim().length === 0}
            onClick={() => void add()}
          >
            <IconPlus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      {mineCount > 0 && mineCount !== tasks.length ? (
        <div className="segment sm:w-fit">
          <button
            className={`segment-item ${mineOnly ? "" : "segment-item-on"}`}
            onClick={() => setMineOnly(false)}
          >
            All tasks ({tasks.length})
          </button>
          <button
            className={`segment-item ${mineOnly ? "segment-item-on" : ""}`}
            onClick={() => setMineOnly(true)}
          >
            Mine ({mineCount})
          </button>
        </div>
      ) : null}

      <TaskGroup
        title={`Open (${open.length})`}
        tasks={open}
        busy={busy}
        empty={mineOnly ? "Nothing outstanding for you." : "Nothing outstanding."}
        onToggle={(task) => void setCompleted(task, true)}
        onDelete={deleteTask}
      />

      {done.length > 0 ? (
        <TaskGroup
          title={`Done (${done.length})`}
          tasks={done}
          busy={busy}
          empty=""
          onToggle={(task) => void setCompleted(task, false)}
          onDelete={deleteTask}
        />
      ) : null}
    </div>
  );

  async function add() {
    if (!name.trim()) return;
    await onSend(
      `/api/campaigns/${campaignId}/tasks`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          assignedToId: assignedToId || undefined,
          dueDate: dueDate || undefined,
        }),
      },
      "Could not add that task.",
    );
    setName("");
    setDueDate("");
  }
}

function TaskGroup({
  title,
  tasks,
  busy,
  empty,
  onToggle,
  onDelete,
}: {
  title: string;
  tasks: TaskView[];
  busy: boolean;
  empty: string;
  onToggle: (task: TaskView) => void;
  onDelete: (task: TaskView) => void;
}) {
  return (
    <div className="card overflow-hidden">
      <p className="border-b border-slate-100 px-4 py-2.5 text-[13px] font-semibold">{title}</p>
      {tasks.length === 0 ? (
        <p className="px-4 py-9 text-center text-[13px] text-slate-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {tasks.map((task) => {
            const finished = task.state === "COMPLETED";
            return (
              <li
                key={task.id}
                className="group flex flex-wrap items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50/70"
              >
                <button
                  className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border transition ${
                    finished
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-slate-300 bg-white text-transparent hover:border-emerald-500 hover:bg-emerald-500 hover:text-white"
                  }`}
                  disabled={busy}
                  aria-label={finished ? `Reopen ${task.name}` : `Complete ${task.name}`}
                  onClick={() => onToggle(task)}
                >
                  <IconCheck className="h-3 w-3" />
                </button>

                <span
                  className={`min-w-0 flex-1 truncate text-[13px] ${
                    finished ? "text-slate-400 line-through" : ""
                  }`}
                >
                  {task.name}
                </span>

                {task.assignedTo ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <Avatar name={task.assignedTo.name} className="h-4 w-4 text-[9px] leading-none" />
                    {task.assignedTo.name}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">Unassigned</span>
                )}

                <span className="text-xs">
                  <DueDate iso={task.dueDate} done={finished} />
                </span>

                {/* Hidden until the row is under the cursor: a column of bins invites the
                    one click on this screen that cannot be undone. */}
                <button
                  className="rounded p-1 text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 focus-visible:opacity-100 group-hover:opacity-100"
                  disabled={busy}
                  aria-label={`Delete ${task.name}`}
                  onClick={() => onDelete(task)}
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
