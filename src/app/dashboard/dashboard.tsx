"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AccessSection from "@/components/dashboard/access-section";
import CampaignsSection from "@/components/dashboard/campaigns-section";
import CreatorsSection from "@/components/dashboard/creators-section";
import DiscoverySection from "@/components/dashboard/discovery-section";
import LinksSection, { type BusyKind } from "@/components/dashboard/links-section";
import {
  IconAlert,
  IconBriefcase,
  IconChart,
  IconCompass,
  IconKey,
  IconLogout,
  IconSpark,
} from "@/components/icons";
import Toast, { type Notice, type NoticeTone } from "@/components/toast";
import type { PlatformReadiness } from "@/lib/metrics";
import {
  DEFAULT_SECTION,
  sectionById,
  sectionsFor,
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
  /** Only the owner sees Access; the API refuses it regardless of what the nav shows. */
  isOwner: boolean;
  readiness: PlatformReadiness[];
  creatorStatsAvailable: boolean;
  /** Read from the URL on the server, so a reload opens the section the user was on. */
  initialSection: SectionId;
  /** The campaign workspace to open, when the URL names one. */
  initialCampaignId: string | null;
  /** The signed-in person's id, so a new campaign defaults to them as manager. */
  meId: string;
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
    // Leaving Campaigns must drop the open campaign too, or coming back would reopen a
    // workspace the person had navigated away from.
    url.searchParams.delete("campaign");
    window.history.replaceState(null, "", url);
  }, []);

  return [section, select];
}

/**
 * The open campaign, also in the address bar.
 *
 * A campaign workspace is the screen people send each other — "look at this one" — so it has
 * to be a link, and it has to survive the reload that follows a deploy.
 */
function useCampaignInUrl(initial: string | null): [string | null, (next: string | null) => void] {
  const [campaignId, setCampaignId] = useState<string | null>(initial);

  useEffect(() => {
    const onPop = () =>
      setCampaignId(new URLSearchParams(window.location.search).get("campaign"));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const open = useCallback((next: string | null) => {
    setCampaignId(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("campaign", next);
    else url.searchParams.delete("campaign");
    window.history.replaceState(null, "", url);
  }, []);

  return [campaignId, open];
}

const SECTION_ICON: Record<SectionId, (p: { className?: string }) => React.ReactElement> = {
  campaigns: IconBriefcase,
  links: IconChart,
  engagement: IconSpark,
  discovery: IconCompass,
  access: IconKey,
};

export default function Dashboard({
  name,
  email,
  isOwner,
  readiness,
  creatorStatsAvailable,
  initialSection,
  initialCampaignId,
  meId,
}: Props) {
  const router = useRouter();

  const [section, selectSection] = useSectionInUrl(initialSection);
  const [openCampaignId, openCampaign] = useCampaignInUrl(initialCampaignId);
  const [summary, setSummary] = useState<DetectionSummary | null>(null);
  const [results, setResults] = useState<LinkResult[]>([]);
  const [creatorStats, setCreatorStats] = useState<Record<string, CreatorStats>>({});
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyKind>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Most of the app only ever has bad news to report; campaigns also confirm things that
  // worked, which must not arrive looking like an alarm.
  const setError = useCallback((message: string) => setNotice({ message, tone: "error" }), []);
  const notify = useCallback(
    (message: string, tone: NoticeTone = "success") => setNotice({ message, tone }),
    [],
  );
  const clearNotice = useCallback(() => setNotice(null), []);

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
      clearNotice();
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
    [clearNotice, setError],
  );

  const runFetch = useCallback(async (kind: "process" | "refresh") => {
    setBusy(kind);
    clearNotice();
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
  }, [clearNotice, setError]);

  /**
   * Kept separate from runFetch because each creator costs an extra provider call.
   * With text, the accounts come from what was pasted; without it, from the current results.
   */
  const loadCreatorStats = useCallback(async (text?: string) => {
    setBusy("creators");
    clearNotice();
    try {
      const response = await fetch("/api/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text ?? "" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "Could not fetch creator stats.");
        return;
      }
      setCreatorStats(body.creatorStats ?? {});
      if (Array.isArray(body.skipped) && body.skipped.length > 0) {
        setError(`Could not read an account from: ${body.skipped.join(", ")}`);
      }
    } catch {
      setError("Could not fetch creator stats.");
    } finally {
      setBusy(null);
    }
  }, [clearNotice, setError]);

  async function onSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const unconfigured = readiness.filter((item) => !item.configured);
  const creatorCards = Object.values(creatorStats);
  const active = sectionById(section);
  const sections = sectionsFor(isOwner);

  // Discovery has no badge: its count is the whole directory, not something loaded here.
  const badgeFor = (id: SectionId) => {
    if (id === "links") return results.length || null;
    if (id === "engagement") return creatorCards.length || null;
    return null;
  };

  return (
    <div className="min-h-screen lg:flex">
      <aside className="z-30 border-b border-white/5 bg-ink-950 text-slate-300 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[248px] lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r lg:border-black/40">
        <div className="flex items-center gap-2.5 px-4 py-4 lg:px-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-950/40 ring-1 ring-inset ring-white/20">
            <IconChart className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight text-white">
              Social Metrics
            </p>
            <p className="truncate text-[11px] leading-tight text-slate-500">
              Influencer operations
            </p>
          </div>
        </div>

        <nav className="px-3 pb-3 lg:flex-1">
          <p className="mb-1.5 hidden px-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-600 lg:block">
            Workspace
          </p>
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {sections.map((item) => {
              const selected = item.id === section;
              const Icon = SECTION_ICON[item.id];
              const badge = badgeFor(item.id);

              return (
                <li key={item.id} className="lg:w-full">
                  <button
                    className={`group relative flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors duration-150 ${
                      selected
                        ? "bg-white/[0.07] text-white"
                        : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
                    }`}
                    aria-current={selected ? "page" : undefined}
                    onClick={() => selectSection(item.id)}
                  >
                    {selected ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-1.5 -left-3 hidden w-[3px] rounded-r-full bg-indigo-400 lg:block"
                      />
                    ) : null}
                    <Icon
                      className={`h-[17px] w-[17px] shrink-0 transition-colors ${
                        selected ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-400"
                      }`}
                    />
                    <span className="flex-1">{item.label}</span>
                    {badge ? (
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                          selected
                            ? "bg-indigo-500/20 text-indigo-300"
                            : "bg-white/[0.06] text-slate-400"
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

        {/* The account sits at the foot of the rail, where people look for it, and signing
            out is an icon beside it rather than a nav item pretending to be a place. */}
        <div className="hidden p-3 lg:block">
          <div className="flex items-center gap-2.5 rounded-lg bg-white/[0.04] px-2.5 py-2 ring-1 ring-inset ring-white/[0.06]">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-slate-600 to-slate-700 text-[11px] font-semibold text-white">
              {name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium leading-tight text-slate-200">{name}</p>
              <p className="truncate text-[11px] leading-tight text-slate-500" title={email}>
                {email}
              </p>
            </div>
            <button
              className="shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
              title="Sign out"
              aria-label="Sign out"
              onClick={onSignOut}
            >
              <IconLogout className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-canvas/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold leading-tight">{active.label}</h1>
              <p className="mt-0.5 truncate text-[13px] leading-tight text-slate-500">
                {active.description}
              </p>
            </div>
            <button className="btn-secondary btn-sm lg:hidden" onClick={onSignOut}>
              <IconLogout className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </header>

        <main className="mx-auto min-w-0 max-w-[1360px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          {unconfigured.length > 0 && (section === "links" || section === "engagement") ? (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-xs">
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

          {section === "campaigns" ? (
            <CampaignsSection
              meId={meId}
              openCampaignId={openCampaignId}
              onOpenCampaign={openCampaign}
              onNotify={notify}
            />
          ) : section === "links" ? (
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
              onLookUp={(text) => void loadCreatorStats(text)}
              onGoToLinks={() => selectSection("links")}
            />
          ) : section === "discovery" ? (
            <DiscoverySection onError={setError} />
          ) : isOwner ? (
            <AccessSection email={email} onError={setError} />
          ) : null}
        </main>
      </div>

      <Toast notice={notice} onDismiss={clearNotice} />
    </div>
  );
}
