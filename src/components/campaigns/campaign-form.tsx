"use client";

import { useState } from "react";
import { IconArrow, IconRefresh } from "@/components/icons";
import { istDay, toDayInput } from "@/lib/campaigns/dates";
import { CAMPAIGN_STATUS_LABEL, CAMPAIGN_STATUSES } from "@/lib/campaigns/status";
import type { CampaignDetail, Person } from "@/lib/campaigns/types";

type Props = {
  people: Person[];
  /** The signed-in person, offered as the manager because they usually are. */
  meId: string;
  /** Present when editing. Everything a campaign holds can be corrected afterwards. */
  existing?: CampaignDetail;
  /** False for members, who get no budget box and send no budget. */
  canSeeMoney: boolean;
  onSaved: (id: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
};

/**
 * One form for creating and for correcting.
 *
 * Editing is not a nicety: a campaign is typed in a hurry the moment a deal lands, and a name
 * with a typo in it, or a date the brand moved, is the normal case rather than the exception.
 * A tool that can only create is a tool people stop trusting the first time they misspell
 * something.
 */
export default function CampaignForm({
  people,
  meId,
  existing,
  canSeeMoney,
  onSaved,
  onCancel,
  onError,
}: Props) {
  const [name, setName] = useState(existing?.name ?? "");
  const [brand, setBrand] = useState(existing?.brand ?? "");
  const [startDate, setStartDate] = useState(
    existing ? toDayInput(new Date(existing.startDate)) : istDay(),
  );
  const [endDate, setEndDate] = useState(
    existing ? toDayInput(new Date(existing.endDate)) : "",
  );
  const [brief, setBrief] = useState(existing?.brief ?? "");
  const [managerId, setManagerId] = useState(existing?.manager?.id ?? meId);
  const [budget, setBudget] = useState(
    existing?.budget === null || existing?.budget === undefined ? "" : String(existing.budget),
  );
  const [status, setStatus] = useState(existing?.status ?? "PLANNING");
  const [busy, setBusy] = useState(false);

  const ready = name.trim() && brand.trim() && startDate && endDate;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    try {
      const response = await fetch(
        existing ? `/api/campaigns/${existing.id}` : "/api/campaigns",
        {
          method: existing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            brand: brand.trim(),
            startDate,
            endDate,
            brief: brief.trim() || (existing ? null : undefined),
            managerId: managerId || undefined,
            // Left out entirely for a member rather than sent as null: they were handed a
            // redacted campaign, and echoing that back would erase a budget they cannot see.
            // An empty box means "not decided", which is different from a budget of zero.
            ...(canSeeMoney ? { budget: budget.trim() === "" ? null : Number(budget) } : {}),
            status,
          }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        onError(body.error ?? "Could not save that campaign.");
        return;
      }
      onSaved(existing ? existing.id : body.id);
    } catch {
      onError("Could not save that campaign.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <h3 className="text-base font-semibold">
        {existing ? "Edit campaign" : "New campaign"}
      </h3>
      <p className="mt-0.5 text-sm text-slate-500">
        {existing
          ? "Changing the dates does not move any deadlines already set on influencers or tasks."
          : "Once it exists you can add influencers from Discovery and the work starts tracking itself."}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Campaign name">
          <input
            className="field"
            value={name}
            autoFocus
            placeholder="Diwali launch"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field label="Brand">
          <input
            className="field"
            value={brand}
            placeholder="Acme"
            onChange={(event) => setBrand(event.target.value)}
          />
        </Field>

        <Field label="Start date">
          <input
            className="field"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </Field>

        <Field label="End date">
          <input
            className="field"
            type="date"
            value={endDate}
            min={startDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </Field>

        <Field label="Campaign manager">
          <select
            className="field"
            value={managerId}
            onChange={(event) => setManagerId(event.target.value)}
          >
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </Field>

        {canSeeMoney ? (
          <Field label="Budget (₹, optional)">
            <input
              className="field"
              inputMode="numeric"
              value={budget}
              placeholder="250000"
              onChange={(event) => setBudget(event.target.value.replace(/[^\d]/g, ""))}
            />
          </Field>
        ) : null}

        <Field label="Status">
          <select
            className="field"
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            {CAMPAIGN_STATUSES.map((value) => (
              <option key={value} value={value}>
                {CAMPAIGN_STATUS_LABEL[value]}
              </option>
            ))}
          </select>
        </Field>

        <div className="sm:col-span-2">
          <Field label="Brief (optional)">
            <textarea
              className="field min-h-[96px] resize-y"
              value={brief}
              placeholder="What the brand wants, deliverables, dos and don'ts."
              onChange={(event) => setBrief(event.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          className="btn-primary w-full sm:w-auto"
          disabled={!ready || busy}
          onClick={() => void submit()}
        >
          {busy ? <IconRefresh className="h-4 w-4 animate-spin" /> : null}
          {existing ? "Save changes" : "Create campaign"}
          {existing ? null : <IconArrow className="h-4 w-4" />}
        </button>
        <button className="btn-secondary w-full sm:w-auto" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
