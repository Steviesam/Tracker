"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import CreatorsSection from "@/components/dashboard/creators-section";
import DiscoverySection from "@/components/dashboard/discovery-section";
import LinksSection, { type BusyKind } from "@/components/dashboard/links-section";
import { IconAlert, IconChart, IconCompass, IconLogout, IconSpark } from "@/components/icons";
import Toast from "@/components/toast";
import type { PlatformReadiness } from "@/lib/metrics";
import {
  DEFAULT_SECTION,
  SECTIONS,
  sectionById,
  toSectionId,
  type SectionId,
} from "@/lib/sections";
import {
  PLATFORM_LABEL,
  type CreatorStats,
  type DetectionSummary,
  type LinkResult,
} from "@/lib/types";

type Props = {
  name: string;
  email: string;
  readiness: PlatformReadiness[];
  creatorStatsAvailable: boolean;
  /** Read from the URL on the server, so a reload opens the section the user was on. */
  initialSection: SectionId;
};

/**
 * Keeps the open section in the address bar.
 *
 * Held only in React state, the section reset to Metrics on every reload — losing your place
 * mid-search — and no view could be linked to or bookmarked. `replaceState` writes the URL
 * without a navigation, so switching sections stays instant and does not stack up history
 * entries; `popstate` keeps the back button honest.
 */
function useSectionInUrl(initial: SectionId): [SectionId, (next: SectionId) => void] {
  const [section, setSection] = useState<SectionId>(initial);

  useEffect(() => {
    const onPop = () => {
      const fromUrl = toSectionId(new URLSearchParams(window.location.search).get("section"));
      setSection(fromUrl ?? DEFAULT_SECTION);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const select = useCallback((next: SectionId) => {
    setSection(next);
    const url = new URL(window.location.href);
    if (next === DEFAULT_SECTION) url.searchParams.delete("section");
    else url.searchParams.set("section", next);
    window.history.replaceState(null, "", url);
  }, []);

  return [section, select];
}

const SECTION_ICON: Record<SectionId, (p: { className?: string }) => React.ReactElement> = {
  links: IconChart,
  engagement: IconSpark,
  discovery: IconCompass,
};

export default function Dashboard({
  name,
  email,
  readiness,
  creatorStatsAvailable,
  initialSection,
}: Props) {
  const router = useRouter();

  const [section, selectSection] = useSectionInUrl(initialSection);
  const [summary, setSummary] = useState<DetectionSummary | null>(null);
  const [results, setResults] = useState<LinkResult[]>([]);
  const [creatorStats, setCreatorStats] = useState<Record<string, CreatorStats>>({});
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyKind>(null);
  const [error, setError] = useState<string | null>(null);

  // Detection and results live server-side for the session, so a reload restores them.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/results")
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (cancelled || !body) return;
        setSummary(body.summary ?? null);
        setResults(body.results ?? []);
        setCreatorStats(body.creatorStats ?? {});
        setLastRefreshedAt(body.lastRefreshedAt ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const startDetection = useCallback(
    async (kind: "upload" | "paste", request: () => Promise<Response>) => {
      setBusy(kind);
      setError(null);
      setResults([]);
      setCreatorStats({});
      setLastRefreshedAt(null);

      try {
        const response = await request();
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(body.error ?? "Could not read those links.");
          setSummary(null);
          return;
        }
        setSummary(body.summary);
      } catch {
        setError("Request failed. Check the server is running.");
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const runFetch = useCallback(async (kind: "process" | "refresh") => {
    setBusy(kind);
    setError(null);
    try {
      const response = await fetch("/api/process", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "Could not fetch metrics.");
        return;
      }
      setResults(body.results ?? []);
      setCreatorStats(body.creatorStats ?? {});
      setLastRefreshedAt(body.lastRefreshedAt ?? null);
    } catch {
      setError("Could not fetch metrics.");
    } finally {
      setBusy(null);
    }
  }, []);

  // Kept separate from runFetch because each creator costs an extra provider call.
  const loadCreatorStats = useCallback(async () => {
    setBusy("creators");
    setError(null);
    try {
      const response = await fetch("/api/creators", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "Could not fetch creator stats.");
        return;
      }
      setCreatorStats(body.creatorStats ?? {});
    } catch {
      setError("Could not fetch creator stats.");
    } finally {
      setBusy(null);
    }
  }, []);

  async function onSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const unconfigured = readiness.filter((item) => !item.configured);
  const creatorCards = Object.values(creatorStats);
  const active = sectionById(section);

  // Discovery has no badge: its count is the whole directory, not something loaded here.
  const badgeFor = (id: SectionId) => {
    if (id === "links") return results.length || null;
    if (id === "engagement") return creatorCards.length || null;
    return null;
  };

  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <aside className="border-b border-slate-800 bg-slate-900 text-slate-300 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-b-0">
        <div className="flex items-center gap-2.5 px-5 py-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
            <IconChart className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">Social Metrics</p>
            <p className="truncate text-xs text-slate-400" title={email}>
              {name}
            </p>
          </div>
        </div>

        <nav className="px-3 pb-3 lg:flex-1">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {SECTIONS.map((item) => {
              const selected = item.id === section;
              const Icon = SECTION_ICON[item.id];
              const badge = badgeFor(item.id);

              return (
                <li key={item.id} className="lg:w-full">
                  <button
                    className={`relative flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-all duration-150 ${
                      selected
                        ? "bg-slate-800 text-white shadow-sm"
                        : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                    }`}
                    aria-current={selected ? "page" : undefined}
                    onClick={() => selectSection(item.id)}
                  >
                    {selected ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-1.5 left-0 hidden w-0.5 rounded-full bg-indigo-400 lg:block"
                      />
                    ) : null}
                    <Icon
                      className={`h-4 w-4 shrink-0 ${selected ? "text-indigo-400" : "text-slate-500"}`}
                    />
                    <span className="flex-1">{item.label}</span>
                    {badge ? (
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs tabular-nums ${
                          selected ? "bg-indigo-500/20 text-indigo-300" : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {badge}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="hidden px-3 pb-4 lg:block">
          <button
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-white"
            onClick={onSignOut}
          >
            <IconLogout className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{active.label}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{active.description}</p>
          </div>
          <button className="btn-secondary lg:hidden" onClick={onSignOut}>
            <IconLogout className="h-4 w-4" />
            Sign out
          </button>
        </header>

        {unconfigured.length > 0 && section !== "discovery" ? (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <strong>
                No data provider configured for{" "}
                {unconfigured.map((item) => PLATFORM_LABEL[item.platform]).join(", ")}.
              </strong>{" "}
              Those links return N/A with a reason. Metrics are never estimated.
            </p>
          </div>
        ) : null}

        {section === "links" ? (
          <LinksSection
            summary={summary}
            results={results}
            lastRefreshedAt={lastRefreshedAt}
            busy={busy}
            onUpload={(file) => {
              const form = new FormData();
              form.append("file", file);
              void startDetection("upload", () =>
                fetch("/api/upload", { method: "POST", body: form }),
              );
            }}
            onPaste={(text) =>
              void startDetection("paste", () =>
                fetch("/api/urls", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ text }),
                }),
              )
            }
            onFetch={(kind) => void runFetch(kind)}
          />
        ) : section === "engagement" ? (
          <CreatorsSection
            results={results}
            stats={creatorCards}
            available={creatorStatsAvailable}
            busy={busy}
            onFetch={() => void loadCreatorStats()}
            onGoToLinks={() => selectSection("links")}
          />
        ) : (
          <DiscoverySection onError={setError} />
        )}
      </main>

      <Toast message={error} onDismiss={() => setError(null)} />
    </div>
  );
}
