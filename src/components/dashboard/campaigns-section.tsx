"use client";

import { useCallback, useEffect, useState } from "react";
import { CampaignBadge, ProgressBar } from "@/components/campaigns/bits";
import CampaignForm from "@/components/campaigns/campaign-form";
import MyWorkPanel from "@/components/campaigns/my-work";
import CampaignWorkspace from "@/components/campaigns/workspace";
import { IconAlert, IconArrow, IconRefresh, IconSearch, IconUsers } from "@/components/icons";
import type { NoticeTone } from "@/components/toast";
import { CAMPAIGN_STATUS_LABEL, CAMPAIGN_STATUSES, type CampaignStatus } from "@/lib/campaigns/status";
import type { CampaignSummary, MyWork, Person } from "@/lib/campaigns/types";
import { formatDay, formatRupees } from "@/lib/format";

type Props = {
  meId: string;
  /** Set from the URL, so a campaign can be linked to and survives a reload. */
  openCampaignId: string | null;
  onOpenCampaign: (id: string | null) => void;
  onNotify: (message: string, tone?: NoticeTone) => void;
};

export default function CampaignsSection({
  meId,
  openCampaignId,
  onOpenCampaign,
  onNotify,
}: Props) {
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [work, setWork] = useState<MyWork | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CampaignStatus | "">("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const onError = useCallback(
    (message: string) => onNotify(message, "error"),
    [onNotify],
  );

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (status) params.set("status", status);

      const [listed, mine] = await Promise.all([
        fetch(`/api/campaigns?${params}`).then((response) => response.json()),
        fetch("/api/my-work").then((response) => response.json()),
      ]);

      if (listed.error) {
        onError(listed.error);
        return;
      }
      setCampaigns(listed.campaigns ?? []);
      setPeople(listed.people ?? []);
      setWork(mine.error ? null : mine);
    } catch {
      onError("Could not load campaigns.");
    }
  }, [search, status, onError]);

  // Typing in the search box should not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const completeTask = useCallback(
    async (campaignId: string, taskId: string, name: string) => {
      setBusy(true);
      try {
        const response = await fetch(`/api/campaigns/${campaignId}/tasks`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, completed: true }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          onError(body.error ?? "Could not complete that task.");
          return;
        }
        onNotify(`Done — ${name}`);
        await load();
      } finally {
        setBusy(false);
      }
    },
    [load, onError, onNotify],
  );

  if (openCampaignId) {
    return (
      <CampaignWorkspace
        campaignId={openCampaignId}
        meId={meId}
        people={people}
        onBack={() => {
          onOpenCampaign(null);
          void load();
        }}
        onNotify={onNotify}
        onDeleted={() => {
          onOpenCampaign(null);
          void load();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <MyWorkPanel
        work={work}
        busy={busy}
        onOpenCampaign={onOpenCampaign}
        onComplete={completeTask}
      />

      {creating ? (
        <CampaignForm
          people={people}
          meId={meId}
          onError={onError}
          onCancel={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            onNotify("Campaign created. Add influencers to get going.");
            onOpenCampaign(id);
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="field pl-9"
              placeholder="Search by campaign or brand"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select
            className="field w-auto"
            value={status}
            onChange={(event) => setStatus(event.target.value as CampaignStatus | "")}
          >
            <option value="">All statuses</option>
            {CAMPAIGN_STATUSES.map((value) => (
              <option key={value} value={value}>
                {CAMPAIGN_STATUS_LABEL[value]}
              </option>
            ))}
          </select>

          <button className="btn-primary" onClick={() => setCreating(true)}>
            New campaign
          </button>
        </div>
      )}

      {campaigns === null ? (
        <div className="space-y-2">
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-24 w-full" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="card px-4 py-12 text-center">
          <p className="text-sm font-medium">
            {search || status ? "No campaign matches that." : "No campaigns yet."}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {search || status
              ? "Try a different search, or clear the status filter."
              : "Create one, add influencers from Discovery, and the tracking starts itself."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {campaigns.map((campaign, index) => (
            <li key={campaign.id} className="animate-rise" style={{ "--i": index } as React.CSSProperties}>
              <button
                className="card-interactive w-full p-4 text-left"
                onClick={() => onOpenCampaign(campaign.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{campaign.name}</p>
                    <p className="truncate text-sm text-slate-500">{campaign.brand}</p>
                  </div>
                  <CampaignBadge status={campaign.status} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <IconUsers className="h-3.5 w-3.5" />
                    {campaign.influencers.total}{" "}
                    {campaign.influencers.total === 1 ? "influencer" : "influencers"}
                  </span>
                  <span>
                    {formatDay(campaign.startDate)} – {formatDay(campaign.endDate)}
                  </span>
                  {campaign.manager ? <span>{campaign.manager.name}</span> : null}
                </div>

                <div className="mt-3">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Progress</span>
                    <span className="font-medium tabular-nums">{campaign.progress}%</span>
                  </div>
                  <ProgressBar value={campaign.progress} />
                </div>

                {campaign.tasks.overdue > 0 || campaign.influencers.overdue > 0 ? (
                  <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-rose-600">
                    <IconAlert className="h-3.5 w-3.5" />
                    {[
                      campaign.tasks.overdue > 0 ? `${campaign.tasks.overdue} task` : null,
                      campaign.influencers.overdue > 0
                        ? `${campaign.influencers.overdue} influencer`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}{" "}
                    overdue
                  </p>
                ) : campaign.tasks.dueToday > 0 ? (
                  <p className="mt-3 text-xs font-medium text-amber-600">
                    {campaign.tasks.dueToday} due today
                  </p>
                ) : null}

                {campaign.money.outstanding > 0 ? (
                  <p className="mt-1.5 text-xs text-slate-500">
                    {formatRupees(campaign.money.outstanding)} still owed to{" "}
                    {campaign.money.owedTo}{" "}
                    {campaign.money.owedTo === 1 ? "creator" : "creators"}
                  </p>
                ) : null}

                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-indigo-600">
                  Open <IconArrow className="h-3.5 w-3.5" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {busy ? (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <IconRefresh className="h-3.5 w-3.5 animate-spin" />
          Saving…
        </p>
      ) : null}
    </div>
  );
}
