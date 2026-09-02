"use client";

import { useMemo, useState } from "react";
import { DueDate } from "@/components/campaigns/bits";
import type { ConfirmRequest } from "@/components/confirm";
import { IconCheck, IconTrash } from "@/components/icons";
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
          <button className="btn-primary" disabled={busy || name.trim().length === 0} onClick={() => void add()}>
            Add
          </button>
        </div>
      </div>

      {mineCount > 0 && mineCount !== tasks.length ? (
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 sm:w-fit">
          <button
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              mineOnly ? "text-slate-600" : "bg-white text-slate-900 shadow-sm"
            }`}
            onClick={() => setMineOnly(false)}
          >
            All tasks ({tasks.length})
          </button>
          <button
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              mineOnly ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
            }`}
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
      <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">{title}</p>
      {tasks.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {tasks.map((task) => {
            const finished = task.state === "COMPLETED";
            return (
              <li key={task.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <button
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded border transition ${
                    finished
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-slate-300 text-transparent hover:border-emerald-500 hover:text-emerald-600"
                  }`}
                  disabled={busy}
                  aria-label={finished ? `Reopen ${task.name}` : `Complete ${task.name}`}
                  onClick={() => onToggle(task)}
                >
                  <IconCheck className="h-3.5 w-3.5" />
                </button>

                <span
                  className={`min-w-0 flex-1 truncate text-sm ${
                    finished ? "text-slate-400 line-through" : ""
                  }`}
                >
                  {task.name}
                </span>

                {task.assignedTo ? (
                  <span className="text-xs text-slate-500">{task.assignedTo.name}</span>
                ) : (
                  <span className="text-xs text-slate-400">Unassigned</span>
                )}

                <span className="text-xs">
                  <DueDate iso={task.dueDate} done={finished} />
                </span>

                <button
                  className="text-slate-400 transition hover:text-rose-600"
                  disabled={busy}
                  aria-label={`Delete ${task.name}`}
                  onClick={() => onDelete(task)}
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
