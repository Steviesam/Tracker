"use client";

/**
 * Handing out a piece of work.
 *
 * Name, person, priority and deadline are the four things a task cannot be assigned
 * without; everything else is optional and sits below them. The deadline is a date and a
 * separate time, because most work is due "on Thursday" and some is due "at 11:00", and one
 * combined field would force everybody to answer the harder question.
 */

import { useEffect, useState } from "react";
import { IconClose } from "@/components/icons";
import type { Person } from "@/lib/campaigns/types";
import { istDay } from "@/lib/campaigns/dates";
import {
  DEFAULT_REMINDER_MINUTES,
  PRIORITIES,
  PRIORITY_LABEL,
  REMINDER_CHOICES,
  type Priority,
} from "@/lib/tasks/model";

export type NewTaskInput = {
  name: string;
  description: string;
  brand: string;
  priority: Priority;
  assignedToId: string;
  campaignId: string;
  dueDay: string;
  dueTime: string;
  reminderMinutes: number | null;
};

type Props = {
  people: Person[];
  campaigns: Array<{ id: string; name: string; brand: string }>;
  meId: string;
  busy: boolean;
  onSubmit: (input: NewTaskInput) => void;
  onClose: () => void;
};

export default function AssignTask({ people, campaigns, meId, busy, onSubmit, onClose }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [assignedToId, setAssignedToId] = useState(meId);
  const [campaignId, setCampaignId] = useState("");
  // Today, because the overwhelming majority of what gets assigned is for today. A blank
  // date would mean every task started life without a deadline and therefore without a
  // reminder, which is the one thing the request called mandatory.
  const [dueDay, setDueDay] = useState(() => istDay());
  const [dueTime, setDueTime] = useState("");
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(DEFAULT_REMINDER_MINUTES);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const campaign = campaigns.find((row) => row.id === campaignId);

  return (
    <div className="card animate-rise">
      <div className="card-head flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold leading-tight">Assign a task</h3>
          <p className="mt-0.5 text-[13px] text-slate-500">
            It appears on their list straight away, sorted by priority.
          </p>
        </div>
        <button
          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close"
          onClick={onClose}
        >
          <IconClose className="h-4 w-4" />
        </button>
      </div>

      <form
        className="space-y-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          onSubmit({
            name: name.trim(),
            description: description.trim(),
            brand: brand.trim(),
            priority,
            assignedToId,
            campaignId,
            dueDay,
            dueTime,
            reminderMinutes,
          });
        }}
      >
        <div>
          <label className="label mb-1 block" htmlFor="task-name">
            Task
          </label>
          <input
            id="task-name"
            className="field"
            placeholder="Shortlist 20 influencers for Brand X"
            value={name}
            maxLength={200}
            required
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label mb-1 block" htmlFor="task-person">
              Assign to
            </label>
            <select
              id="task-person"
              className="field"
              value={assignedToId}
              onChange={(event) => setAssignedToId(event.target.value)}
            >
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                  {person.id === meId ? " (me)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label mb-1 block" htmlFor="task-priority">
              Priority
            </label>
            <select
              id="task-priority"
              className="field"
              value={priority}
              onChange={(event) => setPriority(event.target.value as Priority)}
            >
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABEL[value]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label mb-1 block" htmlFor="task-day">
              Deadline
            </label>
            <input
              id="task-day"
              type="date"
              className="field"
              value={dueDay}
              onChange={(event) => setDueDay(event.target.value)}
            />
          </div>

          <div>
            <label className="label mb-1 block" htmlFor="task-time">
              Time (optional)
            </label>
            <input
              id="task-time"
              type="time"
              className="field"
              value={dueTime}
              disabled={!dueDay}
              onChange={(event) => setDueTime(event.target.value)}
            />
          </div>

          <div>
            <label className="label mb-1 block" htmlFor="task-reminder">
              Remind
            </label>
            <select
              id="task-reminder"
              className="field"
              value={reminderMinutes ?? ""}
              disabled={!dueDay}
              onChange={(event) =>
                setReminderMinutes(event.target.value ? Number(event.target.value) : null)
              }
            >
              <option value="">No reminder</option>
              {REMINDER_CHOICES.map((choice) => (
                <option key={choice.minutes} value={choice.minutes}>
                  {choice.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label mb-1 block" htmlFor="task-campaign">
              Campaign (optional)
            </label>
            <select
              id="task-campaign"
              className="field"
              value={campaignId}
              onChange={(event) => setCampaignId(event.target.value)}
            >
              <option value="">No campaign</option>
              {campaigns.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · {row.brand}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label mb-1 block" htmlFor="task-brand">
              Brand or client
            </label>
            <input
              id="task-brand"
              className="field"
              // A campaign already names its brand, so the field goes quiet rather than
              // inviting a second answer that could contradict the first.
              placeholder={campaign ? campaign.brand : "Who is this for?"}
              value={campaign ? "" : brand}
              disabled={Boolean(campaign)}
              maxLength={120}
              onChange={(event) => setBrand(event.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label mb-1 block" htmlFor="task-description">
            Description (optional)
          </label>
          <textarea
            id="task-description"
            className="field min-h-[72px] resize-y"
            placeholder="Anything they need to know before starting."
            value={description}
            maxLength={2000}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
          <button className="btn btn-primary sm:w-auto" disabled={busy || !name.trim()}>
            {busy ? "Assigning…" : "Assign task"}
          </button>
          <button type="button" className="btn sm:w-auto" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
