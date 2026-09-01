"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconCompass,
  IconFilter,
  IconPin,
  IconRefresh,
  IconSearch,
  IconTag,
  IconUpload,
  IconUsers,
} from "@/components/icons";
import {
  EMPTY_FILTERS,
  FOLLOWER_BANDS,
  MAX_REFRESH,
  PAGE_SIZE,
  SORT_KEYS,
  type DirectoryCreator,
  type DirectoryFilters,
  type Facet,
  type Facets,
  type ImportSummary,
  type LiveFollowers,
  type SortKey,
} from "@/lib/directory/types";
import { formatMetric } from "@/lib/format";

const SORT_LABEL: Record<SortKey, string> = {
  followers: "Most followers",
  username: "A – Z",
  city: "By city",
};

/** Serverless hosts cap a request body; Vercel's is 4.5 MB and cannot be raised. */
const REQUEST_BODY_LIMIT = 4.5 * 1024 * 1024;

/**
 * Names the likely cause when the server could not say so itself.
 *
 * A rejected upload is the one failure the user can actually act on — split the sheet —
 * but only if told. "Could not import that file" sent people looking at the file's
 * contents instead of its size.
 */
function importFailure(status: number, size: number): string {
  if (status === 413 || size > REQUEST_BODY_LIMIT) {
    return (
      `That file is ${(size / 1024 / 1024).toFixed(1)} MB. A single upload cannot exceed ` +
      "4.5 MB on this host, so it was rejected before reaching the app. Split the sheet " +
      "into smaller files and upload them one after another — handles already in the " +
      "directory are updated in place, so nothing is duplicated."
    );
  }
  if (status === 504) {
    return (
      "The import ran out of time. Upload the sheet in a few smaller files instead — " +
      "each one picks up where the last left off."
    );
  }
  return `The import failed (HTTP ${status}). Nothing was saved, so it is safe to retry.`;
}

type Props = { onError: (message: string) => void };

export default function DiscoverySection({ onError }: Props) {
  const [filters, setFilters] = useState<DirectoryFilters>(EMPTY_FILTERS);
  const [band, setBand] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("followers");
  const [page, setPage] = useState(0);

  const [creators, setCreators] = useState<DirectoryCreator[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<ImportSummary | null>(null);
  const [refreshing, setRefreshing] = useState<string[]>([]);

  const fileInput = useRef<HTMLInputElement>(null);
  // Facets only change on import, so they are requested once and then on demand.
  const needFacets = useRef(true);
  /**
   * Bumped to force a reload when nothing else changed.
   *
   * Resetting the filters after an import sets them back to the same EMPTY_FILTERS object
   * they already held, so React bails out of the render and the query never re-runs —
   * leaving the screen showing the directory as it was before the upload.
   */
  const [reloadToken, setReloadToken] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.state) params.set("state", filters.state);
    if (filters.city) params.set("city", filters.city);
    if (filters.niche) params.set("niche", filters.niche);
    if (filters.minFollowers !== null) params.set("minFollowers", String(filters.minFollowers));
    if (filters.maxFollowers !== null) params.set("maxFollowers", String(filters.maxFollowers));
    if (filters.search) params.set("search", filters.search);
    params.set("sort", sort);
    params.set("page", String(page));
    if (needFacets.current) params.set("facets", "1");

    try {
      const response = await fetch(`/api/directory?${params}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        onError(body.error ?? "Could not search the directory.");
        return;
      }
      setCreators(body.creators ?? []);
      setTotal(body.total ?? 0);
      if (body.facets) {
        setFacets(body.facets);
        needFacets.current = false;
      }
    } catch {
      onError("Could not reach the directory.");
    } finally {
      setLoading(false);
    }
    // reloadToken is not read here by design: it exists purely to give this callback a new
    // identity so the effect below re-runs when the query itself has not changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sort, page, reloadToken, onError]);

  // Typing in the search box should not fire a query per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => void load(), filters.search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, filters.search]);

  /**
   * Swaps the sheet's rounded count for the one Instagram shows now.
   *
   * The new number is patched into the rows already on screen instead of re-running the
   * search: a creator whose live count crosses the selected follower band would otherwise
   * vanish from the page the moment the user checked it, which reads as a bug.
   */
  const refresh = useCallback(
    async (usernames: string[]) => {
      if (usernames.length === 0) return;
      setRefreshing((current) => [...new Set([...current, ...usernames])]);
      try {
        const response = await fetch("/api/directory/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usernames }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          onError(body.error ?? "Could not refresh follower counts.");
          return;
        }

        const results: LiveFollowers[] = body.results ?? [];
        const live = new Map(results.map((result) => [result.username, result]));
        setCreators((current) =>
          current.map((creator) => {
            const result = live.get(creator.username);
            if (!result || result.followers === null) return creator;
            return {
              ...creator,
              followers: result.followers,
              followersSource: "live",
              followersCheckedAt: result.checkedAt,
            };
          }),
        );

        const failed = results.filter((result) => result.error);
        if (failed.length > 0) {
          onError(
            failed.length === 1
              ? `@${failed[0].username}: ${failed[0].error}`
              : `${failed.length} of ${results.length} handles could not be checked. ${failed[0].error}`,
          );
        }
      } catch {
        onError("Could not reach Instagram for follower counts.");
      } finally {
        setRefreshing((current) => current.filter((name) => !usernames.includes(name)));
      }
    },
    [onError],
  );

  function update(patch: Partial<DirectoryFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(0);
  }

  function pickBand(id: string | null) {
    setBand(id);
    const chosen = FOLLOWER_BANDS.find((entry) => entry.id === id);
    update({
      minFollowers: chosen ? chosen.min : null,
      maxFollowers: chosen?.max ?? null,
    });
  }

  function reset() {
    setBand(null);
    setSort("followers");
    setFilters(EMPTY_FILTERS);
    setPage(0);
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    setImported(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/directory/import", { method: "POST", body: form });
      // Not every failure reaches the route. A body over the host's request limit is
      // rejected at the edge, which answers with an HTML page rather than our JSON, and
      // the old fallback then blamed the file itself for a size limit it never hit.
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        onError(body.error ?? importFailure(response.status, file.size));
        return;
      }
      setImported(body.summary);
      needFacets.current = true;
      reset();
      setReloadToken((value) => value + 1);
    } catch {
      onError(
        "The import did not finish. If the sheet is large, the connection may have " +
          "dropped before it uploaded — try splitting it into smaller files.",
      );
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const cities = useMemo(() => {
    if (!facets) return [];
    if (filters.state) return facets.citiesByState[filters.state] ?? [];

    // With no state chosen, every city is offered. A city name can appear under more than
    // one state, so the counts are summed rather than one of them shown.
    const totals = new Map<string, number>();
    for (const facet of Object.values(facets.citiesByState).flat()) {
      totals.set(facet.value, (totals.get(facet.value) ?? 0) + facet.count);
    }
    return [...totals.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }, [facets, filters.state]);

  // Only the cards still showing the sheet's figure, so the bulk button never spends a
  // lookup on a creator the user just checked.
  const unchecked = useMemo(
    () =>
      creators
        .filter((creator) => creator.followersSource !== "live")
        .map((creator) => creator.username)
        .slice(0, MAX_REFRESH),
    [creators],
  );

  const activeCount = [
    filters.state,
    filters.city,
    filters.niche,
    filters.search,
    band,
  ].filter(Boolean).length;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const empty = facets !== null && facets.total === 0;

  return (
    <div className="space-y-4">
      <input
        ref={fileInput}
        type="file"
        accept=".csv,.tsv,.txt,.xlsx,.xlsm"
        className="hidden"
        onChange={(event) => void importFile(event.target.files?.[0])}
      />

      {empty ? (
        <EmptyDirectory
          importing={importing}
          onImport={() => fileInput.current?.click()}
        />
      ) : (
        <>
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                <IconCompass className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">
                  {facets ? formatMetric(facets.total) : "—"} creators in the directory
                </p>
                <p className="text-sm text-slate-500">
                  Upload another sheet any time — matching handles update in place.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {unchecked.length > 0 ? (
                <button
                  className="btn-secondary"
                  onClick={() => void refresh(unchecked)}
                  disabled={refreshing.length > 0}
                  title="Fetches the exact count from Instagram for the creators on this page that still show the sheet's figure. One lookup each."
                >
                  <IconRefresh
                    className={`h-4 w-4 ${refreshing.length > 0 ? "animate-spin" : ""}`}
                  />
                  {refreshing.length > 0
                    ? "Checking…"
                    : `Check ${unchecked.length} against Instagram`}
                </button>
              ) : null}

              <button
                className="btn-secondary"
                onClick={() => fileInput.current?.click()}
                disabled={importing}
              >
                <IconUpload className="h-4 w-4" />
                {importing ? "Importing…" : "Import sheet"}
              </button>
            </div>
          </div>

          {imported ? (
            <ImportReport summary={imported} onDismiss={() => setImported(null)} />
          ) : null}

          <div className="card space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  className="field pl-9"
                  placeholder="Search by handle or name…"
                  value={filters.search ?? ""}
                  onChange={(event) => update({ search: event.target.value || null })}
                />
              </div>

              <select
                className="field w-auto"
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as SortKey);
                  setPage(0);
                }}
              >
                {SORT_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABEL[key]}
                  </option>
                ))}
              </select>

              {activeCount > 0 ? (
                <button className="btn-ghost" onClick={reset}>
                  Clear {activeCount} filter{activeCount === 1 ? "" : "s"}
                </button>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                icon={<IconPin className="h-3.5 w-3.5" />}
                label="State"
                value={filters.state}
                options={facets?.states ?? []}
                // A city rarely survives a state change, and a stale pair matches nothing.
                onChange={(value) => update({ state: value, city: null })}
              />
              <Select
                icon={<IconPin className="h-3.5 w-3.5" />}
                label="City"
                value={filters.city}
                options={cities}
                onChange={(value) => update({ city: value })}
              />
              <Select
                icon={<IconTag className="h-3.5 w-3.5" />}
                label="Category / niche"
                value={filters.niche}
                options={facets?.niches ?? []}
                onChange={(value) => update({ niche: value })}
              />
            </div>

            <div>
              <p className="label mb-2 flex items-center gap-1.5">
                <IconUsers className="h-3.5 w-3.5" />
                Followers
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={band === null} onClick={() => pickBand(null)}>
                  Any
                </Chip>
                {FOLLOWER_BANDS.map((entry) => (
                  <Chip
                    key={entry.id}
                    active={band === entry.id}
                    onClick={() => pickBand(band === entry.id ? null : entry.id)}
                  >
                    {entry.label}
                  </Chip>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-500">
              {loading ? (
                "Searching…"
              ) : (
                <>
                  <span className="font-semibold text-slate-900">{formatMetric(total)}</span>{" "}
                  creator{total === 1 ? "" : "s"} match
                  {activeCount === 0 ? " (no filters applied)" : ""}
                </>
              )}
            </p>
            {pageCount > 1 && !loading ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  Page {page + 1} of {pageCount}
                </span>
                <button
                  className="btn-secondary"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <button
                  className="btn-secondary"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="card space-y-3 p-4">
                  <div className="flex items-center gap-3">
                    <div className="skeleton h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <div className="skeleton h-3.5 w-2/3" />
                      <div className="skeleton h-3 w-1/3" />
                    </div>
                  </div>
                  <div className="skeleton h-3 w-full" />
                </div>
              ))}
            </div>
          ) : creators.length === 0 ? (
            <div className="card flex flex-col items-center gap-2 px-6 py-14 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-400">
                <IconFilter className="h-5 w-5" />
              </span>
              <h3 className="mt-1 font-semibold">No creators match</h3>
              <p className="max-w-sm text-sm text-slate-500">
                Try widening the follower range or clearing a filter.
              </p>
              {activeCount > 0 ? (
                <button className="btn-secondary mt-3" onClick={reset}>
                  Clear filters
                </button>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {creators.map((creator, index) => (
                <CreatorCard
                  key={creator.id}
                  creator={creator}
                  index={index}
                  refreshing={refreshing.includes(creator.username)}
                  onRefresh={() => void refresh([creator.username])}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** "3 minutes ago", so a card can say how old a live count is without a date library. */
function sinceLabel(iso: string | null): string {
  if (!iso) return "";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function CreatorCard({
  creator,
  index,
  refreshing,
  onRefresh,
}: {
  creator: DirectoryCreator;
  index: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const place = [creator.city, creator.state].filter(Boolean).join(", ");
  const live = creator.followersSource === "live";

  return (
    <article
      className="card-interactive animate-rise p-4"
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 to-rose-500 text-sm font-semibold text-white">
          {(creator.displayName ?? creator.username).charAt(0).toUpperCase()}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold leading-tight">
            <a
              href={`https://www.instagram.com/${creator.username}/`}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-indigo-600"
            >
              {creator.displayName ?? creator.username}
            </a>
          </h3>
          <p className="truncate text-xs text-slate-500">@{creator.username}</p>
        </div>

        <div className="shrink-0 text-right">
          {/* Never abbreviated to 1.2M: the user is comparing this against the number on
              the profile itself, and a rounded figure reads as a mismatch. */}
          <p className="text-sm font-semibold tabular-nums">
            {creator.followers === null ? (
              <span className="text-slate-300" title="No follower count in the sheet">
                N/A
              </span>
            ) : (
              formatMetric(creator.followers)
            )}
          </p>

          {/* Which number this is, and a way to replace it. A sheet is typed by hand and
              rounded to "309k", so it will not match the profile; saying so is better than
              letting the user assume the app is wrong. */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            title={
              live
                ? `From Instagram, checked ${sinceLabel(creator.followersCheckedAt)}. Click to check again.`
                : "This is the figure from your sheet, usually rounded. Click to fetch the exact count from Instagram."
            }
            className={`label mt-0.5 ml-auto flex items-center gap-1 transition-colors disabled:opacity-60 ${
              live ? "text-emerald-600 hover:text-emerald-700" : "hover:text-slate-900"
            }`}
          >
            <IconRefresh className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Checking…" : live ? "Live" : "From sheet"}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {place ? (
          <span className="chip bg-slate-50 text-slate-600 ring-slate-200">
            <IconPin className="h-3 w-3" />
            {place}
          </span>
        ) : null}
        {creator.niches.map((niche) => (
          <span key={niche} className="chip bg-indigo-50 text-indigo-700 ring-indigo-200">
            <IconTag className="h-3 w-3" />
            {niche}
          </span>
        ))}
        {!place && creator.niches.length === 0 ? (
          <span className="text-xs text-slate-400">No location or category in the sheet</span>
        ) : null}
      </div>
    </article>
  );
}

const FILTERABLE: Array<{ field: string; label: string }> = [
  { field: "state", label: "State" },
  { field: "city", label: "City" },
  { field: "niche", label: "Category" },
  { field: "followers", label: "Followers" },
];

function ImportReport({
  summary,
  onDismiss,
}: {
  summary: ImportSummary;
  onDismiss: () => void;
}) {
  const [open, setOpen] = useState(false);

  const used = summary.sheets.filter((sheet) => sheet.accepted > 0);
  const empty = summary.sheets.filter((sheet) => sheet.accepted === 0);
  // A field the sheet never labelled cannot be filtered on, and that is worth flagging
  // before the user goes looking for an empty dropdown.
  const missing = FILTERABLE.filter((entry) => !summary.fieldsFound.includes(entry.field));

  return (
    <div className="card animate-fade border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold">
          Imported {formatMetric(summary.imported)} creators from {used.length} of{" "}
          {summary.sheets.length} sheet{summary.sheets.length === 1 ? "" : "s"}.
        </p>
        <button
          className="shrink-0 text-emerald-600 transition-colors hover:text-emerald-900"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>

      <p className="mt-1.5 text-emerald-800">
        Read {formatMetric(summary.rowsRead)} rows
        {summary.skippedNoUsername > 0
          ? `, skipped ${formatMetric(summary.skippedNoUsername)} with no readable handle`
          : ""}
        {summary.duplicatesInFile > 0
          ? `, merged ${formatMetric(summary.duplicatesInFile)} repeated handles`
          : ""}
        .
      </p>

      {missing.length > 0 ? (
        <p className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900">
          No <strong>{missing.map((entry) => entry.label).join(", ")}</strong> column was found
          anywhere in this file, so that filter will stay empty. Add a column with that heading
          and upload again — existing creators will be updated, not duplicated.
        </p>
      ) : null}

      {summary.statesDerived > 0 ? (
        <p className="mt-2 rounded-lg bg-emerald-100 px-3 py-2 text-xs text-emerald-900">
          {formatMetric(summary.statesDerived)} creator
          {summary.statesDerived === 1 ? "" : "s"} had no state in the sheet, so it was filled in
          from the city — Chennai as Tamil Nadu, Patna as Bihar. A state your sheet does name is
          never changed.
        </p>
      ) : null}

      {summary.unreadableFollowers > 0 ? (
        <p className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900">
          {formatMetric(summary.unreadableFollowers)} follower value
          {summary.unreadableFollowers === 1 ? "" : "s"} could not be read — free text, or a
          number too large to be an audience, such as a phone number in the wrong column. Those
          creators are stored with followers as N/A and will not appear in a follower-range
          search.
        </p>
      ) : null}

      <button
        className="mt-2 text-xs font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Hide" : "Show"} per-sheet detail
      </button>

      {open ? (
        <div className="mt-2 overflow-x-auto rounded-lg border border-emerald-200 bg-white">
          <table className="w-full text-xs">
            <thead className="border-b border-emerald-100 bg-emerald-50/60 text-left">
              <tr>
                <th className="px-3 py-1.5 font-medium">Sheet</th>
                <th className="px-3 py-1.5 text-right font-medium">Tables</th>
                <th className="px-3 py-1.5 text-right font-medium">Rows</th>
                <th className="px-3 py-1.5 text-right font-medium">Creators</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-50 text-slate-700">
              {summary.sheets.map((sheet) => (
                <tr key={sheet.sheet}>
                  <td className="px-3 py-1.5">{sheet.sheet}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{sheet.blocks}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{sheet.rows}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{sheet.accepted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {open && empty.length > 0 ? (
        <p className="mt-2 text-xs text-emerald-800">
          Nothing was read from {empty.map((sheet) => sheet.sheet).join(", ")} — those tabs have
          no header row naming an Instagram column.
        </p>
      ) : null}

      {open && summary.unmapped.length > 0 ? (
        <p className="mt-2 text-xs text-emerald-800">
          <strong>Kept as notes:</strong> {summary.unmapped.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function EmptyDirectory({
  importing,
  onImport,
}: {
  importing: boolean;
  onImport: () => void;
}) {
  return (
    <section className="card animate-fade flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-400">
        <IconCompass className="h-5 w-5" />
      </span>
      <h3 className="mt-1 font-semibold">The directory is empty</h3>
      <p className="max-w-md text-sm text-slate-500">
        Upload a sheet of Instagram creators to search. Instagram itself publishes no state,
        city or category for an account, so those have to come from your own list.
      </p>

      <div className="mt-4 w-full max-w-md rounded-lg border border-slate-200 bg-slate-50 p-3 text-left">
        <p className="label mb-1.5">Columns it looks for</p>
        <p className="text-xs leading-relaxed text-slate-600">
          A username column is the only one required — <code>Instagram Handle</code>,{" "}
          <code>Username</code> or a full profile URL all work. Then{" "}
          <code>Name</code>, <code>State</code>, <code>City</code>, <code>Category</code> and{" "}
          <code>Followers</code> if you have them. Anything else is kept as notes.
        </p>
      </div>

      <button className="btn-primary mt-4" onClick={onImport} disabled={importing}>
        <IconUpload className="h-4 w-4" />
        {importing ? "Importing…" : "Import a sheet"}
      </button>
    </section>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
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
      {children}
    </button>
  );
}

function Select({
  icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  options: Facet[];
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="block">
      <span className="label mb-1.5 flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <select
        className="field"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        disabled={options.length === 0}
      >
        <option value="">
          {options.length === 0 ? `No ${label.toLowerCase()} in the sheet` : `Any ${label.toLowerCase()}`}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.value} ({formatMetric(option.count)})
          </option>
        ))}
      </select>
    </label>
  );
}
