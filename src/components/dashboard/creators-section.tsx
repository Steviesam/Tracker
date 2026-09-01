"use client";

import { useState } from "react";
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
  /** Looks up the accounts named in a pasted block, independently of the metrics table. */
  onLookUp: (text: string) => void;
  onGoToLinks: () => void;
};

const PLACEHOLDER = `instagram.com/nasa
@lucky_memes00
instagram.com/reel/Da49tXeqveU/
youtube.com/@MrBeast`;

/** Facebook is excluded upstream; see src/lib/creators/index.ts for why. */
function countCreators(results: LinkResult[]): number {
  return new Set(
    results
      .filter((result) => result.creatorId && result.platform !== "FACEBOOK")
      .map((result) => `${result.platform}:${result.creatorId}`),
  ).size;
}

/**
 * The account input.
 *
 * Engagement is a property of an account, so this asks for one directly rather than making
 * the metrics table the only way in — a reel link still works, because that is what someone
 * usually has to hand, but it costs one extra lookup to learn who posted it.
 */
function LookUp({ busy, onLookUp }: { busy: BusyKind; onLookUp: (text: string) => void }) {
  const [text, setText] = useState("");
  const ready = text.trim().length > 0 && busy === null;

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
          <IconUsers className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Look up an account</p>
          <p className="text-sm text-slate-500">
            Profile links, @handles, or a reel link — one per line. A reel link is read as the
            account that posted it: the figures are always that account&apos;s last{" "}
            {CREATOR_SAMPLE_SIZE} reels, never the single reel. Each account costs one provider
            lookup.
          </p>
        </div>
      </div>

      <textarea
        className="input mt-3 h-28 resize-y font-mono text-xs"
        placeholder={PLACEHOLDER}
        spellCheck={false}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />

      <div className="mt-3 flex justify-end">
        <button className="btn-primary" disabled={!ready} onClick={() => onLookUp(text)}>
          {busy === "creators" ? (
            <>
              <IconRefresh className="h-4 w-4 animate-spin" />
              Looking up…
            </>
          ) : (
            <>
              Get stats
              <IconArrow className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function Loading({ count }: { count: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
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
  );
}

export default function CreatorsSection({
  results,
  stats,
  available,
  busy,
  onFetch,
  onLookUp,
  onGoToLinks,
}: Props) {
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

  const fromResults = countCreators(results);

  return (
    <div className="space-y-4">
      <LookUp busy={busy} onLookUp={onLookUp} />

      {fromResults > 0 ? (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
              <IconSpark className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">
                {fromResults} creator{fromResults === 1 ? "" : "s"} in your metrics results
              </p>
              <p className="text-sm text-slate-500">
                Averages their last {CREATOR_SAMPLE_SIZE} videos.
              </p>
            </div>
          </div>

          <button className="btn-secondary" onClick={onFetch} disabled={busy !== null}>
            {busy === "creators" ? (
              <IconRefresh className="h-4 w-4 animate-spin" />
            ) : (
              <IconRefresh className="h-4 w-4" />
            )}
            Look up all {fromResults}
          </button>
        </div>
      ) : results.length > 0 ? null : (
        <p className="px-1 text-sm text-slate-500">
          Or{" "}
          <button className="text-indigo-600 hover:underline" onClick={onGoToLinks}>
            fetch some link metrics
          </button>{" "}
          first and look up every creator in them at once.
        </p>
      )}

      {busy === "creators" && stats.length === 0 ? (
        <Loading count={Math.max(1, Math.min(fromResults || 1, 3))} />
      ) : stats.length > 0 ? (
        <CreatorStatsPanel stats={stats} />
      ) : (
        <div className="card animate-fade flex flex-col items-center gap-2 px-6 py-14 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-400">
            <IconSpark className="h-5 w-5" />
          </span>
          <h3 className="mt-1 font-semibold">Nothing looked up yet</h3>
          <p className="max-w-sm text-sm text-slate-500">
            Paste an account above. This averages its last {CREATOR_SAMPLE_SIZE} videos and works
            out the engagement rate against its follower count.
          </p>
        </div>
      )}
    </div>
  );
}
