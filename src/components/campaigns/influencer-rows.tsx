"use client";

import { useMemo, useState } from "react";
import { DueDate, PaymentBadge, StageBadge } from "@/components/campaigns/bits";
import type { ConfirmRequest } from "@/components/confirm";
import { IconAlert, IconRefresh, IconSearch, IconTrash } from "@/components/icons";
import type { NoticeTone } from "@/components/toast";
import { toDayInput } from "@/lib/campaigns/dates";
import { displayHandle } from "@/lib/campaigns/handles";
import {
  INFLUENCER_STATUS_LABEL,
  INFLUENCER_STATUSES,
  type InfluencerStatus,
} from "@/lib/campaigns/status";
import type { CampaignInfluencerView, Person } from "@/lib/campaigns/types";
import { formatMetric, formatPercent, formatRupees } from "@/lib/format";

type Send = (path: string, init: RequestInit, fallback: string) => Promise<unknown>;

type Props = {
  campaignId: string;
  meId: string;
  influencers: CampaignInfluencerView[];
  people: Person[];
  busy: boolean;
  onSend: Send;
  onNotify: (message: string, tone?: NoticeTone) => void;
  onConfirm: (request: ConfirmRequest) => void;
};

/** Each account costs a provider call, so a refresh cannot ask for the whole table at once. */
const MAX_REFRESH = 20;

/**
 * The questions people actually walk up to this table with, rather than a filter per column.
 * "Who is late" and "who have we not paid" are the two that otherwise get answered by
 * scrolling and squinting.
 */
type Lens = "all" | "mine" | "overdue" | "unpaid";

const LENSES: Array<{ id: Lens; label: string }> = [
  { id: "all", label: "Everyone" },
  { id: "mine", label: "Mine" },
  { id: "overdue", label: "Overdue" },
  { id: "unpaid", label: "Unpaid" },
];

export default function InfluencerRows({
  campaignId,
  meId,
  influencers,
  people,
  busy,
  onSend,
  onNotify,
  onConfirm,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lens, setLens] = useState<Lens>("all");
  const [stage, setStage] = useState<InfluencerStatus | "">("");
  const [search, setSearch] = useState("");

  function patch(body: Record<string, unknown>) {
    return onSend(
      `/api/campaigns/${campaignId}/influencers`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      "Could not save that change.",
    );
  }

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return influencers.filter((row) => {
      if (lens === "mine" && row.assignedTo?.id !== meId) return false;
      if (lens === "overdue" && !row.overdue) return false;
      if (lens === "unpaid" && row.payment !== "UNPAID" && row.payment !== "PART_PAID") {
        return false;
      }
      if (stage && row.status !== stage) return false;
      if (needle && !`${row.handle} ${row.displayName ?? ""}`.toLowerCase().includes(needle)) {
        return false;
      }
      return true;
    });
  }, [influencers, lens, stage, search, meId]);

  // Only the ones never looked up, so a click does not re-buy numbers already paid for.
  const stale = influencers.filter((row) => !row.statsCheckedAt).slice(0, MAX_REFRESH);

  if (influencers.length === 0) {
    return (
      <div className="card px-4 py-12 text-center">
        <p className="text-sm font-medium">Nobody on this campaign yet.</p>
        <p className="mt-1 text-sm text-slate-500">
          Add them from Discovery, or paste a handle for someone not in the directory.
        </p>
      </div>
    );
  }

  function removeInfluencer(row: CampaignInfluencerView) {
    const paid =
      row.amountPaid > 0
        ? ` ${formatRupees(row.amountPaid)} recorded as paid to them will be lost from this campaign's totals.`
        : "";
    onConfirm({
      title: `Remove ${displayHandle(row.platform, row.handle)}?`,
      body: `Any tasks created for them go too.${paid}`,
      action: "Remove",
      onConfirm: () => {
        void (async () => {
          await onSend(
            `/api/campaigns/${campaignId}/influencers?influencerId=${row.id}`,
            { method: "DELETE" },
            "Could not remove them.",
          );
          onNotify(`Removed ${displayHandle(row.platform, row.handle)}.`);
        })();
      },
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {LENSES.map((item) => (
            <button
              key={item.id}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                lens === item.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
              onClick={() => setLens(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <select
          className="field w-auto py-1.5 text-xs"
          value={stage}
          aria-label="Filter by stage"
          onChange={(event) => setStage(event.target.value as InfluencerStatus | "")}
        >
          <option value="">Any stage</option>
          {INFLUENCER_STATUSES.map((value) => (
            <option key={value} value={value}>
              {INFLUENCER_STATUS_LABEL[value]}
            </option>
          ))}
        </select>

        <div className="relative min-w-[140px] flex-1">
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            className="field py-1.5 pl-8 text-xs"
            placeholder="Find a handle"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {stale.length > 0 ? (
          <button
            className="btn-secondary py-1.5 text-xs"
            disabled={busy}
            title="Looks up followers and engagement rate for the ones never checked"
            onClick={async () => {
              await onSend(
                `/api/campaigns/${campaignId}/refresh`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ influencerIds: stale.map((row) => row.id) }),
                },
                "Could not refresh those numbers.",
              );
              onNotify(`Fetched stats for ${stale.length}.`);
            }}
          >
            <IconRefresh className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
            Fetch stats for {stale.length}
          </button>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <div className="card px-4 py-10 text-center">
          <p className="text-sm text-slate-500">
            None of the {influencers.length} on this campaign match that.
          </p>
          <button
            className="btn-ghost mt-2"
            onClick={() => {
              setLens("all");
              setStage("");
              setSearch("");
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {shown.length !== influencers.length ? (
            <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
              Showing {shown.length} of {influencers.length}
            </p>
          ) : null}

          <ul className="divide-y divide-slate-100">
            {shown.map((row) => (
              <li key={row.id}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <button
                    className="min-w-0 flex-1 text-left"
                    aria-expanded={expanded === row.id}
                    onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                  >
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      {displayHandle(row.platform, row.handle)}
                      {row.overdue ? <IconAlert className="h-3.5 w-3.5 text-rose-500" /> : null}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {row.platform === "instagram" ? "Instagram" : "YouTube"}
                      {row.displayName ? ` · ${row.displayName}` : ""}
                      {row.assignedTo ? ` · ${row.assignedTo.name}` : ""}
                    </p>
                  </button>

                  <div className="hidden text-right sm:block">
                    <p className="text-xs tabular-nums text-slate-700">
                      {formatMetric(row.followers)}
                    </p>
                    <p className="text-xs text-slate-400">followers</p>
                  </div>

                  <div className="hidden text-right sm:block">
                    <p className="text-xs tabular-nums text-slate-700">
                      {row.engagementRate === null ? "—" : formatPercent(row.engagementRate)}
                    </p>
                    <p className="text-xs text-slate-400">engagement</p>
                  </div>

                  {row.payment === "NO_RATE" ? null : (
                    <PaymentBadge
                      state={row.payment}
                      agreedRate={row.agreedRate}
                      amountPaid={row.amountPaid}
                    />
                  )}

                  <select
                    className="field w-auto py-1.5 text-xs"
                    value={row.status}
                    disabled={busy}
                    aria-label={`Stage for ${row.handle}`}
                    onChange={(event) =>
                      void patch({
                        influencerId: row.id,
                        status: event.target.value as InfluencerStatus,
                      })
                    }
                  >
                    {INFLUENCER_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {INFLUENCER_STATUS_LABEL[value]}
                      </option>
                    ))}
                  </select>
                </div>

                {expanded === row.id ? (
                  <div className="grid gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="block">
                      <span className="label">Assigned to</span>
                      <select
                        className="field mt-1 py-1.5 text-xs"
                        value={row.assignedTo?.id ?? ""}
                        disabled={busy}
                        onChange={(event) =>
                          void patch({ influencerId: row.id, assignedToId: event.target.value })
                        }
                      >
                        <option value="">Nobody</option>
                        {people.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="label">Deadline</span>
                      <input
                        className="field mt-1 py-1.5 text-xs"
                        type="date"
                        defaultValue={toDayInput(row.deadline ? new Date(row.deadline) : null)}
                        disabled={busy}
                        onChange={(event) =>
                          void patch({ influencerId: row.id, deadline: event.target.value || null })
                        }
                      />
                    </label>

                    <label className="block">
                      <span className="label">Agreed rate (₹)</span>
                      <input
                        className="field mt-1 py-1.5 text-xs"
                        inputMode="numeric"
                        key={`rate:${row.id}:${row.agreedRate}`}
                        defaultValue={row.agreedRate ?? ""}
                        disabled={busy}
                        placeholder="Not agreed"
                        onBlur={(event) => {
                          const raw = event.target.value.replace(/[^\d]/g, "");
                          const next = raw === "" ? null : Number(raw);
                          if (next !== row.agreedRate) {
                            void patch({ influencerId: row.id, agreedRate: next });
                          }
                        }}
                      />
                    </label>

                    <label className="block">
                      <span className="label">Paid so far (₹)</span>
                      <div className="mt-1 flex gap-1.5">
                        <input
                          className="field py-1.5 text-xs"
                          inputMode="numeric"
                          // Keyed on the stored figure so marking someone paid in full
                          // updates the box, which an uncontrolled input would not do.
                          key={`paid:${row.id}:${row.amountPaid}`}
                          defaultValue={row.amountPaid || ""}
                          disabled={busy || row.agreedRate === null}
                          placeholder={row.agreedRate === null ? "Set a rate first" : "0"}
                          onBlur={(event) => {
                            const raw = event.target.value.replace(/[^\d]/g, "");
                            const next = raw === "" ? 0 : Number(raw);
                            if (next !== row.amountPaid) {
                              void patch({ influencerId: row.id, amountPaid: next });
                            }
                          }}
                        />
                        {row.agreedRate !== null && row.payment !== "PAID" ? (
                          <button
                            className="btn-secondary shrink-0 px-2 py-1.5 text-xs"
                            disabled={busy}
                            title="Records the full agreed rate as paid"
                            onClick={() =>
                              void patch({ influencerId: row.id, amountPaid: row.agreedRate })
                            }
                          >
                            All
                          </button>
                        ) : null}
                      </div>
                    </label>

                    <div className="flex items-end justify-between gap-2 sm:col-span-2 lg:col-span-4">
                      <div className="text-xs text-slate-500">
                        <p className="flex flex-wrap items-center gap-1.5">
                          <StageBadge status={row.status} />
                          <DueDate iso={row.deadline} done={row.status === "COMPLETED"} />
                        </p>
                        {row.agreedRate !== null ? (
                          <p className="mt-1.5">
                            Agreed {formatRupees(row.agreedRate)}
                            {row.payment === "PAID"
                              ? " · settled"
                              : ` · ${formatRupees(Math.max(0, row.agreedRate - row.amountPaid))} still owed`}
                          </p>
                        ) : null}
                      </div>
                      <button
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() => removeInfluencer(row)}
                      >
                        <IconTrash className="h-4 w-4" />
                        Remove
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
