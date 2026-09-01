"use client";

import { useMemo, useState } from "react";
import { IconCheck, IconCopy, IconSearch } from "@/components/icons";
import { formatMetric } from "@/lib/format";
import { PLATFORMS, PLATFORM_LABEL, type LinkResult, type Platform } from "@/lib/types";

type SortKey = "platform" | "creator" | "views" | "likes" | "comments" | "shares" | "postedAt";

const METRIC_COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "views", label: "Views" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
];

const PLATFORM_STYLE: Record<Platform, string> = {
  INSTAGRAM: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  YOUTUBE: "bg-red-50 text-red-700 ring-red-200",
  FACEBOOK: "bg-blue-50 text-blue-700 ring-blue-200",
};

const PLATFORM_DOT: Record<Platform, string> = {
  INSTAGRAM: "bg-fuchsia-500",
  YOUTUBE: "bg-red-500",
  FACEBOOK: "bg-blue-600",
};

const PAGE_SIZE = 25;

export default function ResultsTable({ results }: { results: LinkResult[] }) {
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState<Platform | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const [ascending, setAscending] = useState(false);
  const [page, setPage] = useState(0);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();

    const filtered = results.filter((result) => {
      if (platform !== "ALL" && result.platform !== platform) return false;
      if (!needle) return true;
      return (
        result.canonicalUrl.toLowerCase().includes(needle) ||
        (result.creator ?? "").toLowerCase().includes(needle) ||
        (result.title ?? "").toLowerCase().includes(needle) ||
        PLATFORM_LABEL[result.platform].toLowerCase().includes(needle)
      );
    });

    return [...filtered].sort((a, b) => {
      if (sortKey === "platform" || sortKey === "creator") {
        const left = sortKey === "platform" ? PLATFORM_LABEL[a.platform] : (a.creator ?? "");
        const right = sortKey === "platform" ? PLATFORM_LABEL[b.platform] : (b.creator ?? "");
        return ascending ? left.localeCompare(right) : right.localeCompare(left);
      }

      if (sortKey === "postedAt") {
        const left = a.postedAt ? Date.parse(a.postedAt) : null;
        const right = b.postedAt ? Date.parse(b.postedAt) : null;
        if (left === null && right === null) return 0;
        if (left === null) return 1;
        if (right === null) return -1;
        return ascending ? left - right : right - left;
      }

      // N/A rows always sink to the bottom regardless of sort direction.
      const left = a.metrics[sortKey];
      const right = b.metrics[sortKey];
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return ascending ? left - right : right - left;
    });
  }, [results, search, platform, sortKey, ascending]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  /**
   * Scale for the bar under each view count. Taken across everything currently filtered in,
   * not just this page, so paging does not silently rescale the comparison.
   */
  const peakViews = useMemo(
    () => visible.reduce((peak, result) => Math.max(peak, result.metrics.views ?? 0), 0),
    [visible],
  );

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setAscending((value) => !value);
    } else {
      setSortKey(key);
      setAscending(false);
    }
    setPage(0);
  }

  const counts = useMemo(() => {
    const map = new Map<Platform, number>();
    for (const result of results) map.set(result.platform, (map.get(result.platform) ?? 0) + 1);
    return map;
  }, [results]);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search creator, URL or title…"
            className="field pl-9"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </div>

        <div className="flex flex-wrap gap-1">
          <FilterChip
            active={platform === "ALL"}
            onClick={() => {
              setPlatform("ALL");
              setPage(0);
            }}
          >
            All <Count>{results.length}</Count>
          </FilterChip>
          {PLATFORMS.filter((item) => counts.get(item)).map((item) => (
            <FilterChip
              key={item}
              active={platform === item}
              dot={PLATFORM_DOT[item]}
              onClick={() => {
                setPlatform(item);
                setPage(0);
              }}
            >
              {PLATFORM_LABEL[item]} <Count>{counts.get(item)}</Count>
            </FilterChip>
          ))}
        </div>

        <span className="ml-auto shrink-0 text-xs text-slate-500">
          {visible.length === results.length
            ? `${results.length} links`
            : `${visible.length} of ${results.length}`}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
            <tr className="border-b border-slate-200 text-left">
              <SortableHeader
                label="Platform"
                active={sortKey === "platform"}
                ascending={ascending}
                onClick={() => toggleSort("platform")}
              />
              <SortableHeader
                label="Creator"
                active={sortKey === "creator"}
                ascending={ascending}
                onClick={() => toggleSort("creator")}
              />
              <th className="label px-3 py-2.5">Link</th>
              {METRIC_COLUMNS.map((column) => (
                <SortableHeader
                  key={column.key}
                  label={column.label}
                  align="right"
                  active={sortKey === column.key}
                  ascending={ascending}
                  onClick={() => toggleSort(column.key)}
                />
              ))}
              <SortableHeader
                label="Date"
                active={sortKey === "postedAt"}
                ascending={ascending}
                onClick={() => toggleSort("postedAt")}
              />
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {rows.map((result) => (
              <tr key={result.id} className="group align-top transition-colors hover:bg-slate-50">
                <td className="px-3 py-2.5">
                  <span
                    className={`chip ring-1 ring-inset ${PLATFORM_STYLE[result.platform]}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${PLATFORM_DOT[result.platform]}`} />
                    {PLATFORM_LABEL[result.platform]}
                  </span>
                </td>

                <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-700">
                  {result.creator ?? <NA reason={result.note} />}
                </td>

                <td className="max-w-[320px] px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <a
                      href={result.canonicalUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="min-w-0 flex-1 truncate text-slate-600 underline-offset-2 transition-colors hover:text-indigo-600 hover:underline"
                      title={result.canonicalUrl}
                    >
                      {result.canonicalUrl.replace(/^https?:\/\/(www\.)?/, "")}
                    </a>
                    <CopyButton url={result.canonicalUrl} />
                  </div>
                  {result.title ? (
                    <span className="mt-0.5 block truncate text-xs text-slate-400" title={result.title}>
                      {result.title}
                    </span>
                  ) : null}
                  {result.note ? (
                    <span className="mt-1 block text-xs leading-snug text-amber-600">
                      {result.note}
                    </span>
                  ) : null}
                </td>

                {METRIC_COLUMNS.map((column) => {
                  const value = result.metrics[column.key as keyof typeof result.metrics];
                  const share =
                    column.key === "views" && value !== null && peakViews > 0
                      ? (value / peakViews) * 100
                      : null;

                  return (
                    <td
                      key={column.key}
                      className="px-3 py-2.5 text-right tabular-nums text-slate-700"
                    >
                      {value === null ? <NA reason={result.note} /> : formatMetric(value)}
                      {share !== null ? (
                        <span
                          className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-100"
                          title={`${Math.round(share)}% of the best performer in view`}
                        >
                          <span
                            className="block h-full rounded-full bg-indigo-400 transition-all duration-500"
                            style={{ width: `${Math.max(share, 2)}%` }}
                          />
                        </span>
                      ) : null}
                    </td>
                  );
                })}

                <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                  {result.postedAt ? result.postedAt.slice(0, 10) : <NA reason={result.note} />}
                </td>
              </tr>
            ))}

            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4 + METRIC_COLUMNS.length}
                  className="px-3 py-12 text-center text-sm text-slate-500"
                >
                  No links match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center justify-between border-t border-slate-100 p-3 text-sm">
          <span className="text-xs text-slate-500">
            Page {safePage + 1} of {pageCount}
          </span>
          <div className="flex gap-2">
            <button
              className="btn-secondary"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
            >
              Previous
            </button>
            <button
              className="btn-secondary"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

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

function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy link"}
      title={copied ? "Copied" : "Copy link"}
      className={`shrink-0 rounded p-1 transition-all ${
        copied
          ? "text-emerald-600 opacity-100"
          : "text-slate-400 opacity-0 hover:text-slate-900 focus-visible:opacity-100 group-hover:opacity-100"
      }`}
      onClick={() => {
        void navigator.clipboard
          .writeText(url)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => undefined);
      }}
    >
      {copied ? <IconCheck className="h-3.5 w-3.5" /> : <IconCopy className="h-3.5 w-3.5" />}
    </button>
  );
}

function Count({ children }: { children: React.ReactNode }) {
  return <span className="tabular-nums opacity-60">{children}</span>;
}

function FilterChip({
  active,
  dot,
  onClick,
  children,
}: {
  active: boolean;
  dot?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`chip ${
        active
          ? "bg-slate-900 text-white ring-slate-900"
          : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      {dot ? <span className={`h-1.5 w-1.5 rounded-full ${dot}`} /> : null}
      {children}
    </button>
  );
}

function SortableHeader({
  label,
  active,
  ascending,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  ascending: boolean;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th className={`label px-3 py-2.5 ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 transition-colors hover:text-slate-900 ${
          active ? "text-slate-900" : ""
        }`}
      >
        {label}
        <span
          className={`text-[9px] leading-none transition-transform ${
            active ? "text-indigo-600" : "text-slate-300"
          } ${active && ascending ? "rotate-180" : ""}`}
        >
          ▼
        </span>
      </button>
    </th>
  );
}
