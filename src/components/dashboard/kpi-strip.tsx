"use client";

import { IconComment, IconEye, IconHeart, IconShare } from "@/components/icons";
import { formatCompact, formatMetric } from "@/lib/format";
import { METRIC_LABEL, totalsOf, type MetricKey } from "@/lib/totals";
import { PLATFORMS, PLATFORM_LABEL, type LinkResult, type Platform } from "@/lib/types";

const ICON: Record<MetricKey, (p: { className?: string }) => React.ReactElement> = {
  views: IconEye,
  likes: IconHeart,
  comments: IconComment,
  shares: IconShare,
};

const ACCENT: Record<MetricKey, string> = {
  views: "bg-indigo-50 text-indigo-600",
  likes: "bg-rose-50 text-rose-600",
  comments: "bg-amber-50 text-amber-600",
  shares: "bg-emerald-50 text-emerald-600",
};

const BAR: Record<Platform, string> = {
  INSTAGRAM: "bg-gradient-to-r from-fuchsia-500 to-rose-500",
  YOUTUBE: "bg-red-500",
  FACEBOOK: "bg-blue-600",
};

const ORDER: MetricKey[] = ["views", "likes", "comments", "shares"];

/**
 * Headline totals for whatever is currently loaded.
 *
 * Every figure carries how many links produced it. A total of 1.2M from 3 of 40 links
 * means something very different from 1.2M from all 40, and without that the number
 * quietly misleads.
 */
export default function KpiStrip({ results }: { results: LinkResult[] }) {
  const totals = totalsOf(results);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ORDER.map((key, index) => {
          const metric = totals.metrics[key];
          const Icon = ICON[key];
          const complete = metric.available === metric.of;

          return (
            <div
              key={key}
              className="card animate-rise p-4"
              style={{ "--i": index } as React.CSSProperties}
            >
              <div className="flex items-center gap-2">
                <span className={`grid h-7 w-7 place-items-center rounded-lg ${ACCENT[key]}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="label">{METRIC_LABEL[key]}</span>
              </div>

              <p
                className="mt-2.5 text-2xl font-semibold tracking-tight tabular-nums"
                title={metric.total === null ? undefined : formatMetric(metric.total)}
              >
                {metric.total === null ? (
                  <span className="text-slate-300">N/A</span>
                ) : (
                  formatCompact(metric.total)
                )}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {metric.total === null
                  ? "Not reported by any link"
                  : complete
                    ? `All ${metric.of} links`
                    : `${metric.available} of ${metric.of} links`}
              </p>
            </div>
          );
        })}
      </div>

      <div className="card animate-rise flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
        {PLATFORMS.filter((platform) => totals.byPlatform[platform] > 0).map((platform) => {
          const count = totals.byPlatform[platform];
          const share = (count / totals.links) * 100;
          return (
            <div key={platform} className="flex min-w-[150px] flex-1 items-center gap-2.5">
              <span className="w-[68px] shrink-0 text-xs font-medium text-slate-600">
                {PLATFORM_LABEL[platform]}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <span
                  className={`block h-full rounded-full transition-all duration-500 ${BAR[platform]}`}
                  style={{ width: `${share}%` }}
                />
              </span>
              <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums">
                {count}
              </span>
            </div>
          );
        })}

        {totals.failed > 0 ? (
          <span className="chip bg-amber-50 text-amber-700 ring-amber-200">
            {totals.failed} returned nothing
          </span>
        ) : null}
      </div>
    </div>
  );
}
