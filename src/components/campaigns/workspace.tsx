"use client";

import { useCallback, useEffect, useState } from "react";
import AddInfluencers from "@/components/campaigns/add-influencers";
import { Avatar, CampaignBadge, DueDate, ProgressBar, Stat } from "@/components/campaigns/bits";
import CampaignForm from "@/components/campaigns/campaign-form";
import InfluencerRows from "@/components/campaigns/influencer-rows";
import TaskList from "@/components/campaigns/task-list";
import Confirm, { type ConfirmRequest } from "@/components/confirm";
import {
  IconAlert,
  IconArrow,
  IconClock,
  IconEdit,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUsers,
  IconWallet,
} from "@/components/icons";
import type { NoticeTone } from "@/components/toast";
import { CAMPAIGN_STATUS_LABEL, CAMPAIGN_STATUSES, type CampaignStatus } from "@/lib/campaigns/status";
import type { CampaignDetail, Person } from "@/lib/campaigns/types";
import { formatDay, formatRupees } from "@/lib/format";

type Props = {
  campaignId: string;
  meId: string;
  people: Person[];
  onBack: () => void;
  onNotify: (message: string, tone?: NoticeTone) => void;
  onDeleted: () => void;
};

type Tab = "overview" | "influencers" | "tasks" | "activity";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "influencers", label: "Influencers" },
  { id: "tasks", label: "Tasks" },
  { id: "activity", label: "Activity" },
];

export default function CampaignWorkspace({
  campaignId,
  meId,
  people,
  onBack,
  onNotify,
  onDeleted,
}: Props) {
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);

  const onError = useCallback((message: string) => onNotify(message, "error"), [onNotify]);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}`);
      const body = await response.json();
      if (!response.ok) {
        onError(body.error ?? "Could not open that campaign.");
        return;
      }
      setCampaign(body.campaign);
    } catch {
      onError("Could not open that campaign.");
    }
  }, [campaignId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Every write returns the whole campaign, so one round trip both saves the change and
   * brings back the counts, the progress and the history it caused. Patching state locally
   * would mean re-deriving all of that in the browser, and getting it subtly wrong.
   */
  const send = useCallback(
    async (path: string, init: RequestInit, fallback: string) => {
      setBusy(true);
      try {
        const response = await fetch(path, init);
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          onError(body.error ?? fallback);
          return null;
        }
        if (body.campaign) setCampaign(body.campaign);
        return body;
      } catch {
        onError(fallback);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [onError],
  );

  const removeCampaign = useCallback(() => {
    if (!campaign) return;
    setConfirming({
      title: `Delete ${campaign.name}?`,
      body: `This also deletes its ${campaign.counts.influencers.total} influencers, ${campaign.counts.tasks.total} tasks and the whole activity history. It cannot be undone.`,
      action: "Delete campaign",
      onConfirm: () => {
        void (async () => {
          setBusy(true);
          try {
            const response = await fetch(`/api/campaigns/${campaignId}`, { method: "DELETE" });
            if (!response.ok) {
              onError("Could not delete that campaign.");
              return;
            }
            onNotify(`Deleted ${campaign.name}.`);
            onDeleted();
          } finally {
            setBusy(false);
          }
        })();
      },
    });
  }, [campaign, campaignId, onDeleted, onError, onNotify]);

  if (!campaign) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-4 w-28" />
        <div className="card space-y-3 p-5">
          <div className="skeleton h-6 w-56" />
          <div className="skeleton h-3.5 w-72" />
          <div className="skeleton h-2 w-full" />
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((key) => (
            <div key={key} className="skeleton h-[74px]" />
          ))}
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="space-y-4">
        <button className="btn-ghost -ml-2" onClick={() => setEditing(false)}>
          <IconArrow className="h-4 w-4 rotate-180" />
          Back to campaign
        </button>
        <CampaignForm
          people={people}
          meId={meId}
          existing={campaign}
          canSeeMoney={campaign.canSeeMoney}
          onError={onError}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onNotify("Campaign updated.");
            void load();
          }}
        />
      </div>
    );
  }

  const { counts, money, canSeeMoney } = campaign;
  const open = campaign.tasks.filter((task) => task.state !== "COMPLETED");

  return (
    <div className="space-y-4">
      <button
        className="-ml-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        onClick={onBack}
      >
        <IconArrow className="h-3.5 w-3.5 rotate-180" />
        All campaigns
      </button>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-[22px] font-semibold leading-tight">{campaign.name}</h2>
              <CampaignBadge status={campaign.status} />
            </div>

            {/* Separate spans rather than one interpunct-joined string, so the pieces wrap
                as pieces instead of breaking mid-fact on a narrow screen. */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-500">
              <span className="font-medium text-slate-600">{campaign.brand}</span>
              <span className="inline-flex items-center gap-1.5">
                <IconClock className="h-3.5 w-3.5 text-slate-400" />
                {formatDay(campaign.startDate)} – {formatDay(campaign.endDate)}
              </span>
              {campaign.manager ? (
                <span className="inline-flex items-center gap-1.5">
                  <Avatar name={campaign.manager.name} className="h-4 w-4 text-[9px] leading-none" />
                  {campaign.manager.name}
                </span>
              ) : null}
              {campaign.budget !== null ? (
                <span className="inline-flex items-center gap-1.5">
                  <IconWallet className="h-3.5 w-3.5 text-slate-400" />
                  {formatRupees(campaign.budget)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="field w-auto py-1.5 text-[13px]"
              value={campaign.status}
              disabled={busy}
              aria-label="Campaign status"
              onChange={(event) =>
                void send(
                  `/api/campaigns/${campaignId}`,
                  {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: event.target.value as CampaignStatus }),
                  },
                  "Could not change the campaign status.",
                )
              }
            >
              {CAMPAIGN_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {CAMPAIGN_STATUS_LABEL[value]}
                </option>
              ))}
            </select>

            <button className="btn-secondary btn-sm" onClick={() => setEditing(true)}>
              <IconEdit className="h-3.5 w-3.5" />
              Edit
            </button>

            <button
              className="btn-ghost btn-sm text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              disabled={busy}
              title="Delete this campaign"
              aria-label="Delete this campaign"
              onClick={removeCampaign}
            >
              <IconTrash className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="text-slate-500">
              {counts.influencers.total === 0 && counts.tasks.total === 0
                ? "Nothing to track yet"
                : `${counts.influencers.completed} of ${counts.influencers.total} influencers and ${counts.tasks.completed} of ${counts.tasks.total} tasks done`}
            </span>
            <span className="text-[13px] font-semibold tabular-nums text-slate-700">
              {campaign.progress}%
            </span>
          </div>
          <ProgressBar
            value={campaign.progress}
            tone={counts.tasks.overdue > 0 ? "amber" : "indigo"}
            thick
          />
        </div>
      </div>

      {/* Underlined tabs rather than a segmented box: this is navigation within a page, and
          a grey pill tray competes with the toolbars that sit under it. */}
      <div className="-mb-px flex gap-5 overflow-x-auto border-b border-slate-200">
        {TABS.map((item) => {
          const count =
            item.id === "influencers"
              ? counts.influencers.total
              : item.id === "tasks"
                ? counts.tasks.total
                : 0;

          return (
            <button
              key={item.id}
              className={`-mb-px shrink-0 border-b-2 px-0.5 pb-2.5 text-[13px] font-medium transition-colors ${
                tab === item.id
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
              }`}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              {count > 0 ? (
                <span
                  className={`ml-1.5 rounded px-1.5 py-0.5 text-[11px] tabular-nums ${
                    tab === item.id ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {tab === "overview" ? (
        <div className="space-y-4">
          {/*
            Every number on this screen is counted off the influencers, so before there are
            any, six zeros and an empty money panel say nothing except that something might
            be broken. Say what is missing and offer the one thing that fixes it.
          */}
          {counts.influencers.total === 0 ? (
            <div className="card px-6 py-14 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-100 text-indigo-600 ring-1 ring-inset ring-indigo-100">
                <IconUsers className="h-5 w-5" />
              </span>
              <p className="mt-3.5 text-[15px] font-semibold">This campaign is empty.</p>
              <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-slate-500">
                Add the creators you are working with. The counts, the money and the progress
                bar are all worked out from them, and tasks start appearing on their own as
                you move each one through their stages.
              </p>
              <button
                className="btn-primary mt-5"
                onClick={() => {
                  setTab("influencers");
                  setAdding(true);
                }}
              >
                <IconUsers className="h-4 w-4" />
                Add influencers
              </button>
              {campaign.money?.budget != null ? (
                <p className="mt-5 text-[12px] text-slate-400">
                  Budget for this campaign is {formatRupees(campaign.money.budget)}. What you
                  agree with each creator is counted against it.
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Influencers" value={counts.influencers.total} />
                <Stat label="Confirmed" value={counts.influencers.confirmed} />
                <Stat label="Content pending" value={counts.influencers.contentPending} />
                <Stat label="Published" value={counts.influencers.published} />
                <Stat label="Completed" value={counts.influencers.completed} tone="good" />
                <Stat
                  label="Overdue"
                  value={counts.influencers.overdue + counts.tasks.overdue}
                  tone={counts.influencers.overdue + counts.tasks.overdue > 0 ? "warn" : "plain"}
                />
              </div>

              {/* Absent for members: the figures never reach the browser, so there is no
                  panel to hide. */}
              {money ? (
                <div className="card overflow-hidden">
                  <div className="card-head">
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-md bg-slate-100 text-slate-500">
                        <IconWallet className="h-3.5 w-3.5" />
                      </span>
                      <p className="text-sm font-semibold">Money</p>
                    </div>
                    {money.outstanding > 0 ? (
                      <span className="chip bg-amber-50 text-amber-700 ring-amber-200/70">
                        {formatRupees(money.outstanding)} owed to {money.owedTo}{" "}
                        {money.owedTo === 1 ? "creator" : "creators"}
                      </span>
                    ) : money.committed > 0 ? (
                      <span className="chip bg-emerald-50 text-emerald-700 ring-emerald-200/70">
                        Everyone paid
                      </span>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 gap-y-4 p-4 sm:grid-cols-4 sm:divide-x sm:divide-slate-100">
                    <Stat flat label="Budget" value={formatRupees(money.budget)} />
                    <Stat
                      flat
                      label="Committed"
                      value={formatRupees(money.committed)}
                      hint={
                        money.budget !== null && money.committed > 0
                          ? `${Math.round((money.committed / money.budget) * 100)}% of budget`
                          : undefined
                      }
                    />
                    <Stat flat label="Paid" value={formatRupees(money.paid)} tone="good" />
                    <Stat
                      flat
                      label="Outstanding"
                      value={formatRupees(money.outstanding)}
                      tone={money.outstanding > 0 ? "warn" : "plain"}
                    />
                  </div>

                  {money.overBudget ? (
                    <p className="flex items-start gap-2 border-t border-rose-100 bg-rose-50/70 px-4 py-2.5 text-[12px] font-medium text-rose-700">
                      <IconAlert className="mt-px h-3.5 w-3.5 shrink-0" />
                      Committed rates are{" "}
                      {formatRupees(money.committed - (money.budget ?? 0))} over the budget on
                      this campaign.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          )}

          {campaign.brief ? (
            <div className="card p-4">
              <p className="label">Brief</p>
              <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">
                {campaign.brief}
              </p>
            </div>
          ) : null}

          <div className="card overflow-hidden">
            <div className="card-head">
              <p className="text-sm font-semibold">Next up</p>
              {open.length > 5 ? (
                <button
                  className="text-xs font-medium text-indigo-600 transition-colors hover:text-indigo-700"
                  onClick={() => setTab("tasks")}
                >
                  See all {open.length}
                </button>
              ) : null}
            </div>
            {open.length === 0 ? (
              <p className="px-4 py-9 text-center text-[13px] text-slate-500">
                Nothing outstanding. Tasks appear here as influencers move through their
                stages.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {open.slice(0, 5).map((task) => (
                  <li
                    key={task.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50/70"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px]">{task.name}</span>
                    {task.assignedTo ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        <Avatar
                          name={task.assignedTo.name}
                          className="h-4 w-4 text-[9px] leading-none"
                        />
                        {task.assignedTo.name}
                      </span>
                    ) : null}
                    <span className="text-xs">
                      <DueDate iso={task.dueDate} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {tab === "influencers" ? (
        <div className="space-y-3">
          {adding ? (
            <AddInfluencers
              busy={busy}
              onClose={() => setAdding(false)}
              onAdd={async (payload) => {
                const body = await send(
                  `/api/campaigns/${campaignId}/influencers`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  },
                  "Could not add those influencers.",
                );
                if (!body) return;

                // Adding fifteen when two are already there should read as a result, not as
                // a failure — so the notes ride along with the count rather than replacing it.
                const notes = [
                  body.skipped?.length ? `${body.skipped.length} already on it` : null,
                  body.rejected?.length
                    ? `could not read ${body.rejected.slice(0, 2).join(", ")}`
                    : null,
                ].filter(Boolean);

                onNotify(
                  `Added ${body.added} ${body.added === 1 ? "influencer" : "influencers"}` +
                    (notes.length ? ` — ${notes.join(", ")}.` : "."),
                  body.added === 0 ? "error" : "success",
                );
              }}
            />
          ) : (
            <button className="btn-primary" onClick={() => setAdding(true)}>
              <IconPlus className="h-4 w-4" />
              Add influencers
            </button>
          )}

          <InfluencerRows
            campaignId={campaignId}
            meId={meId}
            influencers={campaign.influencers}
            people={people}
            canSeeMoney={canSeeMoney}
            busy={busy}
            onSend={send}
            onNotify={onNotify}
            onConfirm={setConfirming}
          />
        </div>
      ) : null}

      {tab === "tasks" ? (
        <TaskList
          campaignId={campaignId}
          meId={meId}
          tasks={campaign.tasks}
          people={people}
          busy={busy}
          onSend={send}
          onNotify={onNotify}
          onConfirm={setConfirming}
        />
      ) : null}

      {tab === "activity" ? (
        <div className="card overflow-hidden">
          {campaign.activity.length === 0 ? (
            <p className="px-4 py-12 text-center text-[13px] text-slate-500">
              Nothing has happened yet.
            </p>
          ) : (
            /* A rail with a node per entry: the history reads as one thread rather than as
               unrelated rows that happen to be stacked. */
            <ul className="space-y-0 px-4 py-3">
              {campaign.activity.map((entry, index) => (
                <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {index < campaign.activity.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="absolute left-[5px] top-3.5 h-full w-px bg-slate-200"
                    />
                  ) : null}
                  <span
                    aria-hidden="true"
                    className="relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-white bg-slate-300 ring-1 ring-slate-200"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug text-slate-700">{entry.message}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {new Date(entry.createdAt).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Asia/Kolkata",
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* Floats rather than sits in the flow, so a save does not nudge the page down. */}
      {busy ? (
        <p className="animate-fade pointer-events-none fixed bottom-5 left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink-900/90 px-3.5 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur">
          <IconRefresh className="h-3.5 w-3.5 animate-spin" />
          Saving…
        </p>
      ) : null}

      <Confirm request={confirming} onCancel={() => setConfirming(null)} />
    </div>
  );
}
