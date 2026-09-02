"use client";

import { useCallback, useEffect, useState } from "react";
import AddInfluencers from "@/components/campaigns/add-influencers";
import { CampaignBadge, DueDate, ProgressBar, Stat } from "@/components/campaigns/bits";
import CampaignForm from "@/components/campaigns/campaign-form";
import InfluencerRows from "@/components/campaigns/influencer-rows";
import TaskList from "@/components/campaigns/task-list";
import Confirm, { type ConfirmRequest } from "@/components/confirm";
import { IconArrow, IconEdit, IconRefresh, IconTrash, IconUsers } from "@/components/icons";
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
      <div className="space-y-3">
        <div className="skeleton h-8 w-40" />
        <div className="skeleton h-32 w-full" />
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

  const { counts } = campaign;

  return (
    <div className="space-y-4">
      <button className="btn-ghost -ml-2" onClick={onBack}>
        <IconArrow className="h-4 w-4 rotate-180" />
        All campaigns
      </button>

      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{campaign.name}</h2>
              <CampaignBadge status={campaign.status} />
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              {campaign.brand} · {formatDay(campaign.startDate)} – {formatDay(campaign.endDate)}
              {campaign.manager ? ` · ${campaign.manager.name}` : ""}
              {campaign.budget !== null ? ` · ${formatRupees(campaign.budget)}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="field w-auto"
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

            <button className="btn-secondary" onClick={() => setEditing(true)}>
              <IconEdit className="h-4 w-4" />
              Edit
            </button>

            <button
              className="btn-ghost text-slate-500 hover:text-rose-600"
              disabled={busy}
              title="Delete this campaign"
              onClick={removeCampaign}
            >
              <IconTrash className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-slate-500">
              {counts.influencers.total === 0 && counts.tasks.total === 0
                ? "Progress — nothing to track yet"
                : `Progress — ${counts.influencers.completed} of ${counts.influencers.total} influencers and ${counts.tasks.completed} of ${counts.tasks.total} tasks done`}
            </span>
            <span className="font-medium tabular-nums">{campaign.progress}%</span>
          </div>
          <ProgressBar
            value={campaign.progress}
            tone={counts.tasks.overdue > 0 ? "amber" : "indigo"}
          />
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === item.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
            }`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {item.id === "influencers" && counts.influencers.total > 0
              ? ` (${counts.influencers.total})`
              : null}
            {item.id === "tasks" && counts.tasks.total > 0 ? ` (${counts.tasks.total})` : null}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="space-y-4">
          {/*
            Every number on this screen is counted off the influencers, so before there are
            any, six zeros and an empty money panel say nothing except that something might
            be broken. Say what is missing and offer the one thing that fixes it.
          */}
          {counts.influencers.total === 0 ? (
            <div className="card px-4 py-10 text-center">
              <p className="text-sm font-medium">This campaign is empty.</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                Add the creators you are working with. The counts, the money and the progress
                bar are all worked out from them, and tasks start appearing on their own as
                you move each one through their stages.
              </p>
              <button
                className="btn-primary mt-4"
                onClick={() => {
                  setTab("influencers");
                  setAdding(true);
                }}
              >
                <IconUsers className="h-4 w-4" />
                Add influencers
              </button>
              {campaign.money.budget !== null ? (
                <p className="mt-4 text-xs text-slate-400">
                  Budget for this campaign is {formatRupees(campaign.money.budget)}. What you
                  agree with each creator is counted against it.
                </p>
              ) : null}
            </div>
          ) : (
            <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
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

          <div className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Money</p>
              {campaign.money.outstanding > 0 ? (
                <span className="chip bg-amber-50 text-amber-700 ring-amber-200">
                  {formatRupees(campaign.money.outstanding)} owed to {campaign.money.owedTo}{" "}
                  {campaign.money.owedTo === 1 ? "creator" : "creators"}
                </span>
              ) : campaign.money.committed > 0 ? (
                <span className="chip bg-emerald-50 text-emerald-700 ring-emerald-200">
                  Everyone paid
                </span>
              ) : null}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Budget" value={formatRupees(campaign.money.budget)} />
              <Stat label="Committed" value={formatRupees(campaign.money.committed)} />
              <Stat label="Paid" value={formatRupees(campaign.money.paid)} tone="good" />
              <Stat
                label="Outstanding"
                value={formatRupees(campaign.money.outstanding)}
                tone={campaign.money.outstanding > 0 ? "warn" : "plain"}
              />
            </div>

            {campaign.money.overBudget ? (
              <p className="mt-3 text-xs font-medium text-rose-600">
                Committed rates are{" "}
                {formatRupees(campaign.money.committed - (campaign.money.budget ?? 0))} over the
                budget on this campaign.
              </p>
            ) : null}
          </div>
            </>
          )}

          {campaign.brief ? (
            <div className="card p-4">
              <p className="label">Brief</p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-700">{campaign.brief}</p>
            </div>
          ) : null}

          <div className="card overflow-hidden">
            <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">
              Next up
            </p>
            {campaign.tasks.filter((task) => task.state !== "COMPLETED").length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                Nothing outstanding. Tasks appear here as influencers move through their
                stages.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {campaign.tasks
                  .filter((task) => task.state !== "COMPLETED")
                  .slice(0, 5)
                  .map((task) => (
                    <li key={task.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-sm">{task.name}</span>
                      {task.assignedTo ? (
                        <span className="text-xs text-slate-500">{task.assignedTo.name}</span>
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
              Add influencers
            </button>
          )}

          <InfluencerRows
            campaignId={campaignId}
            meId={meId}
            influencers={campaign.influencers}
            people={people}
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
            <p className="px-4 py-10 text-center text-sm text-slate-500">Nothing has happened yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {campaign.activity.map((entry) => (
                <li key={entry.id} className="px-4 py-2.5">
                  <p className="text-sm">{entry.message}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(entry.createdAt).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Kolkata",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {busy ? (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <IconRefresh className="h-3.5 w-3.5 animate-spin" />
          Saving…
        </p>
      ) : null}

      <Confirm request={confirming} onCancel={() => setConfirming(null)} />
    </div>
  );
}
