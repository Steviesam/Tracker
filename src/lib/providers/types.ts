import { EMPTY_METRICS, type DetectedLink, type Metrics, type ResultStatus } from "@/lib/types";

export type ProviderOutcome = {
  creator: string | null;
  /** Stable lookup key for account-level stats; see LinkResult.creatorId. */
  creatorId: string | null;
  title: string | null;
  postedAt: string | null;
  metrics: Metrics;
  status: ResultStatus;
  /** Required whenever anything is N/A, so the UI can always explain a gap. */
  note: string | null;
  /** Identifies which source answered, e.g. "youtube-data-api" or "apify:actor-id". */
  provider: string;
};

export interface MetricsProvider {
  /** Shown in the results table and export so the data's origin is auditable. */
  readonly name: string;
  /** False when the provider has no credentials configured. */
  isConfigured(): boolean;
  fetch(links: DetectedLink[]): Promise<Map<string, ProviderOutcome>>;
}

export function unavailable(note: string, provider: string): ProviderOutcome {
  return {
    creator: null,
    creatorId: null,
    title: null,
    postedAt: null,
    metrics: { ...EMPTY_METRICS },
    status: "unavailable",
    note,
    provider,
  };
}

export function errored(note: string, provider: string): ProviderOutcome {
  return {
    creator: null,
    creatorId: null,
    title: null,
    postedAt: null,
    metrics: { ...EMPTY_METRICS },
    status: "error",
    note,
    provider,
  };
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Accepts ISO strings and unix seconds/milliseconds; returns an ISO string or null. */
export function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Aborts slow provider calls so one bad request cannot hang the whole batch. */
export async function fetchJson(url: string, init?: RequestInit, timeoutMs = 30000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        (body as { error?: { message?: string } | string } | null)?.error &&
        typeof (body as { error?: { message?: string } }).error === "object"
          ? (body as { error: { message?: string } }).error.message
          : `${response.status} ${response.statusText}`;
      throw new Error(message ?? `${response.status} ${response.statusText}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}
