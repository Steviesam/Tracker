"use client";

import CreatorStatsPanel from "@/components/creator-stats";
import type { BusyKind } from "@/components/dashboard/links-section";
import { IconAlert, IconArrow, IconRefresh, IconSpark, IconUsers } from "@/components/icons";
import { CREATOR_SAMPLE_SIZE, type CreatorStats, type LinkResult } from "@/lib/types";

type Props = {
  results: LinkResult[];
  stats: CreatorStats[];
  available: boolean;
  busy: BusyKind;
  onFetch: () => void;
  onGoToLinks: () => void;
};

/** Facebook is excluded upstream; see src/lib/creators/index.ts for why. */
function countCreators(results: LinkResult[]): number {
  return new Set(
    results
      .filter((result) => result.creatorId && result.platform !== "FACEBOOK")
      .map((result) => `${result.platform}:${result.creatorId}`),
  ).size;
}

function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card animate-fade flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-400">
        {icon}
      </span>
      <h3 className="mt-1 font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-slate-500">{body}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export default function CreatorsSection({
  results,
  stats,
  available,
  busy,
  onFetch,
  onGoToLinks,
}: Props) {
  if (results.length === 0) {
    return (
      <Empty
        icon={<IconUsers className="h-5 w-5" />}
        title="No results yet"
        body="Fetch metrics for some links first, then come back to see how each creator's account is performing."
        action={
          <button className="btn-primary" onClick={onGoToLinks}>
            Go to Metrics
            <IconArrow className="h-4 w-4" />
          </button>
        }
      />
    );
  }

  if (!available) {
    return (
      <div className="card animate-fade flex items-start gap-3 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <strong>Creator stats are not configured.</strong> YouTube needs{" "}
          <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">YOUTUBE_API_KEY</code>;
          Instagram needs{" "}
          <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">APIFY_TOKEN</code> and{" "}
          <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">
            APIFY_INSTAGRAM_REELS_ACTOR
          </code>
          .
        </p>
      </div>
    );
  }

  const pending = countCreators(results);

  if (pending === 0) {
    return (
      <Empty
        icon={<IconUsers className="h-5 w-5" />}
        title="No accounts to look up"
        body="None of these links resolve to an account this can read. Facebook is not supported, and Instagram links need a resolvable creator."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
            <IconSpark className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">
              {pending} creator{pending === 1 ? "" : "s"} in your results
            </p>
            <p className="text-sm text-slate-500">
              Averages their last {CREATOR_SAMPLE_SIZE} videos. Each Instagram creator costs one
              provider lookup, so this never runs on its own.
            </p>
          </div>
        </div>

        <button className="btn-primary" onClick={onFetch} disabled={busy !== null}>
          {busy === "creators" ? (
            <>
              <IconRefresh className="h-4 w-4 animate-spin" />
              Fetching…
            </>
          ) : stats.length > 0 ? (
            <>
              <IconRefresh className="h-4 w-4" />
              Refresh
            </>
          ) : (
            <>
              Get creator stats
              <IconArrow className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      {busy === "creators" && stats.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
          {Array.from({ length: Math.min(pending, 3) }).map((_, index) => (
            <div key={index} className="card space-y-3 p-4">
              <div className="flex items-center gap-3">
                <div className="skeleton h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-3.5 w-2/3" />
                  <div className="skeleton h-3 w-1/3" />
                </div>
              </div>
              <div className="skeleton h-8 w-full" />
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-4/5" />
            </div>
          ))}
        </div>
      ) : stats.length > 0 ? (
        <CreatorStatsPanel stats={stats} />
      ) : (
        <Empty
          icon={<IconSpark className="h-5 w-5" />}
          title="Not fetched yet"
          body={`This averages each creator's last ${CREATOR_SAMPLE_SIZE} videos and works out their engagement rate against their follower count.`}
        />
      )}
    </div>
  );
}
