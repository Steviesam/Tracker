"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar, CampaignBadge, ProgressBar } from "@/components/campaigns/bits";
import CampaignForm from "@/components/campaigns/campaign-form";
import MyWorkPanel from "@/components/campaigns/my-work";
import CampaignWorkspace from "@/components/campaigns/workspace";
import {
  IconAlert,
  IconBriefcase,
  IconClock,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconUsers,
  IconWallet,
} from "@/components/icons";
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
  // Answered by the server on every load rather than passed down from the page, so a role
  // taken away in another tab stops showing money at the next request, not the next login.
  const [canSeeMoney, setCanSeeMoney] = useState(false);

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
      setCanSeeMoney(listed.canSeeMoney === true);
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
          canSeeMoney={canSeeMoney}
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
          <div className="relative w-full sm:min-w-[200px] sm:flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="field pl-9"
              placeholder="Search by campaign or brand"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select
            className="field flex-1 sm:w-auto sm:flex-none"
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

          <button className="btn-primary flex-1 sm:flex-none" onClick={() => setCreating(true)}>
            <IconPlus className="h-4 w-4" />
            New campaign
          </button>
        </div>
      )}

      {campaigns === null ? (
        <ul className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <li key={key} className="card space-y-3 p-4">
              <div className="skeleton h-4 w-1/2" />
              <div className="skeleton h-3 w-1/3" />
              <div className="skeleton h-1.5 w-full" />
              <div className="skeleton h-3 w-2/3" />
            </li>
          ))}
        </ul>
      ) : campaigns.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-400">
            <IconBriefcase className="h-5 w-5" />
          </span>
          <p className="mt-3 text-sm font-medium">
            {search || status ? "No campaign matches that." : "No campaigns yet."}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            {search || status
              ? "Try a different search, or clear the status filter."
              : "Create one, add influencers from Discovery, and the tracking starts itself."}
          </p>
          {!search && !status ? (
            <button className="btn-primary mt-4" onClick={() => setCreating(true)}>
              <IconPlus className="h-4 w-4" />
              New campaign
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((campaign, index) => {
            const late = campaign.tasks.overdue + campaign.influencers.overdue;

            return (
              <li
                key={campaign.id}
                className="animate-rise"
                style={{ "--i": index } as React.CSSProperties}
              >
                <button
                  className="card-interactive group flex h-full w-full flex-col p-4 text-left"
                  onClick={() => onOpenCampaign(campaign.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold leading-tight transition-colors group-hover:text-indigo-700">
                        {campaign.name}
                      </p>
                      <p className="mt-0.5 truncate text-[13px] text-slate-500">{campaign.brand}</p>
                    </div>
                    <CampaignBadge status={campaign.status} />
                  </div>

                  <div className="mt-3.5">
                    <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-slate-500">
                        {campaign.influencers.total === 0
                          ? "No creators yet"
                          : `${campaign.influencers.completed} of ${campaign.influencers.total} creators done`}
                      </span>
                      <span className="text-[13px] font-semibold tabular-nums text-slate-700">
                        {campaign.progress}%
                      </span>
                    </div>
                    <ProgressBar
                      value={campaign.progress}
                      tone={campaign.tasks.overdue > 0 ? "amber" : "indigo"}
                    />
                  </div>

                  {/* Pushed to the foot so cards of different heights still line up. */}
                  <div className="mt-auto pt-3.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <IconUsers className="h-3.5 w-3.5 text-slate-400" />
                        {campaign.influencers.total}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <IconClock className="h-3.5 w-3.5 text-slate-400" />
                        {formatDay(campaign.startDate)} – {formatDay(campaign.endDate)}
                      </span>
                      {campaign.manager ? (
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <Avatar
                            name={campaign.manager.name}
                            className="h-4 w-4 text-[9px] leading-none"
                          />
                          <span className="truncate">{campaign.manager.name}</span>
                        </span>
                      ) : null}
                    </div>

                    {late > 0 || campaign.tasks.dueToday > 0 || (campaign.money?.outstanding ?? 0) > 0 ? (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {late > 0 ? (
                          <span className="chip bg-rose-50 text-rose-700 ring-rose-200/70">
                            <IconAlert className="h-3 w-3" />
                            {late} overdue
                          </span>
                        ) : null}
                        {campaign.tasks.dueToday > 0 ? (
                          <span className="chip bg-amber-50 text-amber-700 ring-amber-200/70">
                            {campaign.tasks.dueToday} due today
                          </span>
                        ) : null}
                        {campaign.money && campaign.money.outstanding > 0 ? (
                          <span className="chip bg-slate-50 text-slate-600 ring-slate-200">
                            <IconWallet className="h-3 w-3" />
                            {formatRupees(campaign.money.outstanding)} owed
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
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
