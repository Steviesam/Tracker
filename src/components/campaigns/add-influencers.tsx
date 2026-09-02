"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/campaigns/bits";
import { IconClose, IconRefresh, IconSearch, IconUsers } from "@/components/icons";
import { formatMetric } from "@/lib/format";
import type { DirectoryCreator, Facets } from "@/lib/directory/types";

type Props = {
  onAdd: (payload: { usernames?: string[]; text?: string }) => Promise<void>;
  onClose: () => void;
  busy: boolean;
};

/**
 * Two ways in, because the directory cannot be the only one.
 *
 * Discovery holds Instagram creators somebody uploaded. A campaign routinely involves a
 * YouTube channel, or an Instagram account nobody has added to the sheet yet, and having to
 * import a spreadsheet before you can put one name on a campaign would be absurd.
 */
export default function AddInfluencers({ onAdd, onClose, busy }: Props) {
  const [tab, setTab] = useState<"directory" | "paste">("directory");

  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [niche, setNiche] = useState("");
  const [facets, setFacets] = useState<Facets | null>(null);
  const [results, setResults] = useState<DirectoryCreator[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const [text, setText] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: "1" });
    if (search.trim()) params.set("search", search.trim());
    if (state) params.set("state", state);
    if (niche) params.set("niche", niche);

    try {
      const response = await fetch(`/api/directory?${params}`);
      const body = await response.json();
      setResults(body.creators ?? []);
      if (body.facets) setFacets(body.facets);
    } catch {
      setResults([]);
    }
  }, [search, state, niche]);

  useEffect(() => {
    if (tab !== "directory") return;
    const timer = setTimeout(() => void load(), search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [tab, load, search]);

  function toggle(username: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  }

  return (
    <div className="animate-rise card p-4 ring-1 ring-indigo-500/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="segment">
          {(["directory", "paste"] as const).map((value) => (
            <button
              key={value}
              className={`segment-item ${tab === value ? "segment-item-on" : ""}`}
              onClick={() => setTab(value)}
            >
              {value === "directory" ? "From Discovery" : "Paste handles or links"}
            </button>
          ))}
        </div>
        <button
          className="btn-ghost btn-sm text-slate-400 hover:text-slate-900"
          aria-label="Close"
          onClick={onClose}
        >
          <IconClose className="h-4 w-4" />
        </button>
      </div>

      {tab === "directory" ? (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[180px] flex-1">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="field pl-9"
                placeholder="Search the directory"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select
              className="field w-auto"
              value={state}
              onChange={(event) => setState(event.target.value)}
            >
              <option value="">Any state</option>
              {facets?.states.map((facet) => (
                <option key={facet.value} value={facet.value}>
                  {facet.value} ({facet.count})
                </option>
              ))}
            </select>
            <select
              className="field w-auto"
              value={niche}
              onChange={(event) => setNiche(event.target.value)}
            >
              <option value="">Any category</option>
              {facets?.niches.map((facet) => (
                <option key={facet.value} value={facet.value}>
                  {facet.value} ({facet.count})
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-slate-200">
            {results === null ? (
              <div className="space-y-2 p-3">
                <div className="skeleton h-9 w-full" />
                <div className="skeleton h-9 w-full" />
              </div>
            ) : results.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-slate-500">
                Nothing in the directory matches. Try the other tab and paste a handle.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {results.map((creator) => (
                  <li key={creator.username}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors ${
                        picked.has(creator.username) ? "bg-indigo-50/60" : "hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        checked={picked.has(creator.username)}
                        onChange={() => toggle(creator.username)}
                      />
                      <Avatar name={creator.username} className="h-7 w-7 text-[10px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">
                          @{creator.username}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500">
                          {[creator.city, creator.state].filter(Boolean).join(", ") ||
                            "Location unknown"}
                        </span>
                      </span>
                      <span className="text-[12px] font-medium tabular-nums text-slate-600">
                        {formatMetric(creator.followers)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            className="btn-primary mt-3"
            disabled={busy || picked.size === 0}
            onClick={async () => {
              await onAdd({ usernames: [...picked] });
              setPicked(new Set());
            }}
          >
            {busy ? <IconRefresh className="h-4 w-4 animate-spin" /> : <IconUsers className="h-4 w-4" />}
            Add {picked.size > 0 ? picked.size : ""}{" "}
            {picked.size === 1 ? "influencer" : "influencers"}
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-slate-500">
            One per line. An Instagram handle, or a profile link for either platform — a
            YouTube channel needs its URL, since a bare name is read as Instagram.
          </p>
          <textarea
            className="field mt-2 h-32 resize-y font-mono text-xs"
            placeholder={"@creator\ninstagram.com/anothercreator\nyoutube.com/@somechannel"}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <button
            className="btn-primary mt-3"
            disabled={busy || text.trim().length === 0}
            onClick={async () => {
              await onAdd({ text });
              setText("");
            }}
          >
            {busy ? <IconRefresh className="h-4 w-4 animate-spin" /> : null}
            Add to campaign
          </button>
        </div>
      )}
    </div>
  );
}
