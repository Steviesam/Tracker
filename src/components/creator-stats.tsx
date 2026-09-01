"use client";

import { formatCompact, formatMetric, formatPercent } from "@/lib/format";
import { CREATOR_SAMPLE_SIZE, PLATFORM_LABEL, type CreatorStats, type Platform } from "@/lib/types";

const ACCENT: Record<Platform, string> = {
  INSTAGRAM: "from-fuchsia-500 to-rose-500",
  YOUTUBE: "from-red-500 to-orange-500",
  FACEBOOK: "from-blue-600 to-sky-500",
};

const BADGE: Record<Platform, string> = {
  INSTAGRAM: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  YOUTUBE: "bg-red-50 text-red-700 ring-red-200",
  FACEBOOK: "bg-blue-50 text-blue-700 ring-blue-200",
};

/**
 * Engagement rate is a percentage of followers, so real values sit well under 10%. The bar
 * is scaled to 5% rather than 100%, otherwise every account would render as an empty track.
 */
const RATE_SCALE = 5;

function NA({ reason }: { reason: string | null }) {
  return (
    <span
      className="cursor-help text-slate-300 underline decoration-dotted underline-offset-2"
      title={reason ?? "Not available"}
    >
      N/A
    </span>
  );
}

function Row({
  label,
  value,
  reason,
  strong,
}: {
  label: string;
  value: number | null;
  reason: string | null;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className={`tabular-nums ${strong ? "text-base font-semibold" : "text-sm text-slate-700"}`}>
        {value === null ? <NA reason={reason} /> : formatMetric(value)}
      </dd>
    </div>
  );
}

export default function CreatorStatsPanel({ stats }: { stats: CreatorStats[] }) {
  if (stats.length === 0) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {stats.map((creator, index) => {
        const initial = (creator.displayName ?? creator.creatorId).trim().charAt(0).toUpperCase();
        const rate = creator.engagementRate;
        const fill = rate === null ? 0 : Math.min(100, (rate / RATE_SCALE) * 100);
        const interactions =
          creator.avgLikes === null ? null : creator.avgLikes + (creator.avgComments ?? 0);

        return (
          <article
            key={`${creator.platform}:${creator.creatorId}`}
            className="card-interactive animate-rise overflow-hidden"
            style={{ "--i": index } as React.CSSProperties}
          >
            <div className="flex items-start gap-3 p-4">
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br text-sm font-semibold text-white ${ACCENT[creator.platform]}`}
              >
                {initial}
              </span>

              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold leading-tight">
                  {creator.profileUrl ? (
                    <a
                      className="transition-colors hover:text-indigo-600"
                      href={creator.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={creator.displayName ?? creator.creatorId}
                    >
                      {creator.displayName ?? creator.creatorId}
                    </a>
                  ) : (
                    (creator.displayName ?? creator.creatorId)
                  )}
                </h3>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {creator.followers === null ? (
                    <NA reason={creator.note} />
                  ) : (
                    `${formatCompact(creator.followers)} followers`
                  )}
                </p>
              </div>

              <span className={`chip shrink-0 ${BADGE[creator.platform]}`}>
                {PLATFORM_LABEL[creator.platform]}
              </span>
            </div>

            <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
              <div className="flex items-baseline justify-between">
                <span className="label" title="(avg likes + avg comments) ÷ followers">
                  Engagement rate
                </span>
                <span className="text-xl font-semibold tracking-tight tabular-nums">
                  {rate === null ? <NA reason={creator.note} /> : formatPercent(rate)}
                </span>
              </div>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-200">
                <span
                  className={`block h-full rounded-full bg-gradient-to-r transition-all duration-700 ${ACCENT[creator.platform]}`}
                  style={{ width: `${fill}%` }}
                />
              </span>

              <div className="mt-2 flex items-baseline justify-between">
                <span
                  className="text-xs text-slate-500"
                  title="(avg likes + avg comments) ÷ avg views"
                >
                  Of the people who saw it
                </span>
                <span className="text-xs tabular-nums text-slate-600">
                  {creator.engagementByViews === null ? (
                    <NA reason={creator.note} />
                  ) : (
                    formatPercent(creator.engagementByViews)
                  )}
                </span>
              </div>

              {rate !== null && rate > 100 && interactions !== null && creator.followers !== null ? (
                // The arithmetic rather than a reassurance: the reader can check it against
                // the rows below, which is the only thing that makes a number this large
                // believable.
                <p className="mt-1.5 text-xs leading-snug text-slate-500">
                  {formatMetric(interactions)} likes and comments per video against{" "}
                  {formatMetric(creator.followers)} followers. Reels are shown to people who do
                  not follow the account, so this can pass 100%.
                </p>
              ) : null}
            </div>

            <dl className="space-y-2 p-4">
              <Row
                label={`Avg views · last ${creator.sampleSize || CREATOR_SAMPLE_SIZE}`}
                value={creator.avgViews}
                reason={creator.note}
                strong
              />
              <Row label="Avg likes" value={creator.avgLikes} reason={creator.note} />
              <Row label="Avg comments" value={creator.avgComments} reason={creator.note} />
            </dl>

            {creator.note ? (
              <p className="border-t border-slate-100 px-4 py-2.5 text-xs leading-snug text-amber-600">
                {creator.note}
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
