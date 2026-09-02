"use client";

import { useMemo, useState } from "react";
import { Avatar, DueDate, PaymentBadge, StageBadge } from "@/components/campaigns/bits";
import type { ConfirmRequest } from "@/components/confirm";
import {
  IconAlert,
  IconChevron,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconUsers,
} from "@/components/icons";
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
  /** False for members: the rate columns are not drawn, and were never sent. */
  canSeeMoney: boolean;
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

const LENSES: Array<{ id: Lens; label: string; money?: true }> = [
  { id: "all", label: "Everyone" },
  { id: "mine", label: "Mine" },
  { id: "overdue", label: "Overdue" },
  { id: "unpaid", label: "Unpaid", money: true },
];

export default function InfluencerRows({
  campaignId,
  meId,
  influencers,
  people,
  canSeeMoney,
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
      <div className="card px-6 py-14 text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-400">
          <IconUsers className="h-5 w-5" />
        </span>
        <p className="mt-3 text-sm font-medium">Nobody on this campaign yet.</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-slate-500">
          Add them from Discovery, or paste a handle for someone not in the directory.
        </p>
      </div>
    );
  }

  function removeInfluencer(row: CampaignInfluencerView) {
    const paid =
      row.amountPaid && row.amountPaid > 0
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
        <div className="segment rail w-full max-w-full overflow-x-auto sm:w-auto">
          {LENSES.filter((item) => canSeeMoney || !item.money).map((item) => (
            <button
              key={item.id}
              className={`segment-item ${lens === item.id ? "segment-item-on" : ""}`}
              onClick={() => setLens(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <select
          className="field field-sm w-full sm:w-auto"
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

        {/* Its own line on a phone: a search box sharing a row with two dropdowns ends up
            too narrow to read what you typed. */}
        <div className="relative w-full sm:min-w-[140px] sm:flex-1">
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            className="field field-sm pl-8"
            placeholder="Find a handle"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {stale.length > 0 ? (
          <button
            className="btn-secondary btn-sm"
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
              <li key={row.id} className={expanded === row.id ? "bg-slate-50/50" : ""}>
                {/*
                  A card on a phone and a table row from `lg` up, from one set of markup.

                  Squeezing the table into 390px was the version that failed: the name shared
                  its line with a payment badge and a stage picker, lost the argument, and
                  truncated to nothing — a row of creators you could not tell apart. Stacked,
                  the name gets the full width, the figures sit under it as a sentence, and
                  the stage picker becomes something you can hit.

                  From `lg` the fixed tracks come back. With flex, a long badge on one line
                  pushed the figures out of line with the row above, and a column you cannot
                  run your eye down is not a column.
                */}
                <div
                  className={`px-4 py-3 transition-colors hover:bg-slate-50/70 lg:grid lg:items-center lg:gap-x-4 lg:py-2.5 ${
                    canSeeMoney
                      ? "lg:grid-cols-[minmax(0,1fr)_5rem_5rem_10.5rem_9.5rem_1rem]"
                      : "lg:grid-cols-[minmax(0,1fr)_5rem_5rem_9.5rem_1rem]"
                  }`}
                >
                  <button
                    className="flex w-full min-w-0 items-center gap-2.5 text-left"
                    aria-expanded={expanded === row.id}
                    onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                  >
                    <Avatar name={row.displayName || row.handle} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 truncate text-[13px] font-medium">
                        {displayHandle(row.platform, row.handle)}
                        {row.overdue ? <IconAlert className="h-3.5 w-3.5 text-rose-500" /> : null}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-slate-500">
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            row.platform === "instagram" ? "bg-instagram" : "bg-youtube"
                          }`}
                        />
                        {row.displayName ?? (row.platform === "instagram" ? "Instagram" : "YouTube")}
                        {row.assignedTo ? ` · ${row.assignedTo.name}` : ""}
                      </span>
                    </span>
                    <IconChevron
                      className={`h-4 w-4 shrink-0 text-slate-300 transition-transform lg:hidden ${
                        expanded === row.id ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {/* The same two figures the table gives its own columns, written as a line
                      because there is no room for columns and no need for them at one row. */}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-[42px] text-[12px] text-slate-500 lg:hidden">
                    <span className="tabular-nums">
                      <span className="font-medium text-slate-700">
                        {formatMetric(row.followers)}
                      </span>{" "}
                      followers
                    </span>
                    {row.engagementRate === null ? null : (
                      <span className="tabular-nums">
                        <span className="font-medium text-slate-700">
                          {formatPercent(row.engagementRate)}
                        </span>{" "}
                        engagement
                      </span>
                    )}
                    {row.payment && row.payment !== "NO_RATE" ? (
                      <PaymentBadge
                        state={row.payment}
                        agreedRate={row.agreedRate}
                        amountPaid={row.amountPaid ?? 0}
                      />
                    ) : null}
                  </div>

                  <div className="hidden text-right lg:block">
                    <p className="text-[13px] font-medium tabular-nums text-slate-700">
                      {formatMetric(row.followers)}
                    </p>
                    <p className="text-[11px] leading-tight text-slate-400">followers</p>
                  </div>

                  <div className="hidden text-right lg:block">
                    <p className="text-[13px] font-medium tabular-nums text-slate-700">
                      {row.engagementRate === null ? "—" : formatPercent(row.engagementRate)}
                    </p>
                    <p className="text-[11px] leading-tight text-slate-400">engagement</p>
                  </div>

                  {row.payment && row.payment !== "NO_RATE" ? (
                    <div className="hidden justify-self-start lg:block">
                      <PaymentBadge
                        state={row.payment}
                        agreedRate={row.agreedRate}
                        amountPaid={row.amountPaid ?? 0}
                      />
                    </div>
                  ) : canSeeMoney ? (
                    <div className="hidden lg:block" />
                  ) : null}

                  <select
                    className="field field-sm mt-2.5 w-full lg:mt-0 lg:w-auto lg:justify-self-end"
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

                  <IconChevron
                    className={`hidden h-4 w-4 shrink-0 text-slate-300 transition-transform lg:block ${
                      expanded === row.id ? "rotate-180" : ""
                    }`}
                  />
                </div>

                {expanded === row.id ? (
                  <div
                    className={`animate-fade grid gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3.5 sm:grid-cols-2 ${
                      canSeeMoney ? "lg:grid-cols-4" : ""
                    }`}
                  >
                    <label className="block">
                      <span className="label">Assigned to</span>
                      <select
                        className="field field-sm mt-1"
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
                        className="field field-sm mt-1"
                        type="date"
                        defaultValue={toDayInput(row.deadline ? new Date(row.deadline) : null)}
                        disabled={busy}
                        onChange={(event) =>
                          void patch({ influencerId: row.id, deadline: event.target.value || null })
                        }
                      />
                    </label>

                    {canSeeMoney ? (
                      <>
                        <label className="block">
                          <span className="label">Agreed rate (₹)</span>
                          <input
                            className="field field-sm mt-1 tabular-nums"
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
                              className="field field-sm tabular-nums"
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
                                className="btn-secondary btn-sm shrink-0"
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
                      </>
                    ) : null}

                    <div
                      className={`flex items-end justify-between gap-2 border-t border-slate-200/70 pt-3 sm:col-span-2 ${
                        canSeeMoney ? "lg:col-span-4" : ""
                      }`}
                    >
                      <div className="text-xs text-slate-500">
                        <p className="flex flex-wrap items-center gap-2">
                          <StageBadge status={row.status} />
                          <DueDate iso={row.deadline} done={row.status === "COMPLETED"} />
                        </p>
                        {row.agreedRate !== null ? (
                          <p className="mt-2 tabular-nums">
                            Agreed {formatRupees(row.agreedRate)}
                            {row.payment === "PAID"
                              ? " · settled"
                              : ` · ${formatRupees(Math.max(0, row.agreedRate - (row.amountPaid ?? 0)))} still owed`}
                          </p>
                        ) : null}
                      </div>
                      <button
                        className="btn-ghost btn-sm text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                        disabled={busy}
                        onClick={() => removeInfluencer(row)}
                      >
                        <IconTrash className="h-3.5 w-3.5" />
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
