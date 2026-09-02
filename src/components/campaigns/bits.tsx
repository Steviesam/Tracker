"use client";

/** Small pieces shared by the campaign list and the workspace, so both read the same. */

import { CAMPAIGN_STATUS_LABEL, INFLUENCER_STATUS_LABEL } from "@/lib/campaigns/status";
import type { CampaignStatus, InfluencerStatus } from "@/lib/campaigns/status";
import { daysFromToday } from "@/lib/campaigns/dates";
import { PAYMENT_LABEL, type PaymentState } from "@/lib/campaigns/payments";
import { formatDay, formatRupees } from "@/lib/format";

/** Badge colours, paired with the dot colour that leads them. */
type Tone = { chip: string; dot: string };

const CAMPAIGN_TONE: Record<CampaignStatus, Tone> = {
  PLANNING: { chip: "bg-slate-50 text-slate-600 ring-slate-200", dot: "bg-slate-400" },
  ACTIVE: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-200/70", dot: "bg-emerald-500" },
  COMPLETED: { chip: "bg-indigo-50 text-indigo-700 ring-indigo-200/70", dot: "bg-indigo-500" },
  ON_HOLD: { chip: "bg-amber-50 text-amber-700 ring-amber-200/70", dot: "bg-amber-500" },
};

/**
 * Stages get warmer as the work gets closer to done, so a column of them can be read at a
 * glance without stopping on each word.
 */
const INFLUENCER_TONE: Record<InfluencerStatus, Tone> = {
  SELECTED: { chip: "bg-slate-50 text-slate-600 ring-slate-200", dot: "bg-slate-400" },
  CONTACTED: { chip: "bg-sky-50 text-sky-700 ring-sky-200/70", dot: "bg-sky-500" },
  CONFIRMED: { chip: "bg-violet-50 text-violet-700 ring-violet-200/70", dot: "bg-violet-500" },
  CONTENT_PENDING: { chip: "bg-amber-50 text-amber-700 ring-amber-200/70", dot: "bg-amber-500" },
  APPROVED: { chip: "bg-cyan-50 text-cyan-700 ring-cyan-200/70", dot: "bg-cyan-500" },
  PUBLISHED: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-200/70", dot: "bg-emerald-500" },
  COMPLETED: { chip: "bg-indigo-50 text-indigo-700 ring-indigo-200/70", dot: "bg-indigo-500" },
};

/** A coloured dot carries the state faster than the word does, once you know the palette. */
function Dot({ className }: { className: string }) {
  return <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${className}`} />;
}

export function CampaignBadge({ status }: { status: CampaignStatus }) {
  const tone = CAMPAIGN_TONE[status];
  return (
    <span className={`chip ${tone.chip}`}>
      <Dot className={tone.dot} />
      {CAMPAIGN_STATUS_LABEL[status]}
    </span>
  );
}

export function StageBadge({ status }: { status: InfluencerStatus }) {
  const tone = INFLUENCER_TONE[status];
  return (
    <span className={`chip ${tone.chip}`}>
      <Dot className={tone.dot} />
      {INFLUENCER_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * A date that says how far away it is, because "12 Sep" alone does not answer the only
 * question anyone is asking of a deadline.
 */
export function DueDate({ iso, done = false }: { iso: string | null; done?: boolean }) {
  if (!iso) return <span className="text-slate-400">No date</span>;

  const days = daysFromToday(new Date(iso));
  const label = formatDay(iso);

  if (done) return <span className="text-slate-500">{label}</span>;
  if (days === null) return <span className="text-slate-500">{label}</span>;

  if (days < 0) {
    return (
      <span className="font-medium text-rose-600">
        {label} · {days === -1 ? "1 day late" : `${Math.abs(days)} days late`}
      </span>
    );
  }
  if (days === 0) return <span className="font-medium text-amber-600">{label} · today</span>;
  if (days === 1) return <span className="text-slate-600">{label} · tomorrow</span>;
  return <span className="text-slate-500">{label}</span>;
}

/** A progress bar that turns amber only once the campaign is behind on its own dates. */
export function ProgressBar({
  value,
  tone = "indigo",
  thick = false,
}: {
  value: number;
  tone?: "indigo" | "amber";
  thick?: boolean;
}) {
  const width = Math.min(100, Math.max(0, value));
  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200/60 ${
        thick ? "h-2" : "h-1.5"
      }`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-700 ease-out ${
          tone === "amber"
            ? "bg-gradient-to-r from-amber-400 to-amber-500"
            : "bg-gradient-to-r from-indigo-500 to-violet-500"
        }`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

const PAYMENT_TONE: Record<PaymentState, Tone> = {
  NO_RATE: { chip: "bg-slate-50 text-slate-500 ring-slate-200", dot: "bg-slate-300" },
  UNPAID: { chip: "bg-rose-50 text-rose-700 ring-rose-200/70", dot: "bg-rose-500" },
  PART_PAID: { chip: "bg-amber-50 text-amber-700 ring-amber-200/70", dot: "bg-amber-500" },
  PAID: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-200/70", dot: "bg-emerald-500" },
};

/** Says how much is still owed, not just that something is owed. */
export function PaymentBadge({
  state,
  agreedRate,
  amountPaid,
}: {
  state: PaymentState;
  agreedRate: number | null;
  amountPaid: number;
}) {
  const tone = PAYMENT_TONE[state];
  // What is still owed, not what has gone out: the outstanding figure is the one that
  // decides whether this row needs anything doing, and it fits on one line.
  const detail =
    state === "PART_PAID" && agreedRate !== null
      ? `${formatRupees(agreedRate - amountPaid)} left`
      : state === "UNPAID" && agreedRate !== null
        ? formatRupees(agreedRate)
        : null;

  return (
    <span className={`chip whitespace-nowrap ${tone.chip}`}>
      <Dot className={tone.dot} />
      {PAYMENT_LABEL[state]}
      {detail ? <span className="font-normal tabular-nums opacity-80">{detail}</span> : null}
    </span>
  );
}

/**
 * One figure with its name above it.
 *
 * The number leads at a size you can read across a desk, because these are meant to be
 * glanced at; the label is small and quiet underneath the eye's first stop.
 */
export function Stat({
  label,
  value,
  tone = "plain",
  hint,
  flat = false,
}: {
  label: string;
  value: number | string;
  tone?: "plain" | "warn" | "good";
  /** A line under the figure, for the "of 12" that makes a bare number mean something. */
  hint?: string;
  /** Drops the frame, for figures that already sit inside a card of their own. */
  flat?: boolean;
}) {
  const colour =
    tone === "warn" ? "text-rose-600" : tone === "good" ? "text-emerald-600" : "text-slate-900";
  return (
    <div
      className={
        flat
          ? "px-1 sm:px-4 sm:first:pl-1"
          : "rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 shadow-xs"
      }
    >
      <p className="label truncate">{label}</p>
      <p className={`mt-1 text-[22px] font-semibold leading-none tabular-nums ${colour}`}>
        {value}
      </p>
      {hint ? <p className="mt-1.5 truncate text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

/** The circle of initials that stands in for a creator or a colleague. */
export function Avatar({
  name,
  className = "h-8 w-8 text-[11px]",
}: {
  name: string;
  className?: string;
}) {
  // A stable colour per name, so the same person is the same colour on every screen.
  const palette = [
    "from-indigo-500 to-violet-600",
    "from-rose-500 to-pink-600",
    "from-emerald-500 to-teal-600",
    "from-amber-500 to-orange-600",
    "from-sky-500 to-blue-600",
    "from-fuchsia-500 to-purple-600",
  ];
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) % 997;

  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-semibold text-white ring-1 ring-inset ring-white/25 ${palette[hash % palette.length]} ${className}`}
    >
      {name.replace(/^@/, "").slice(0, 1).toUpperCase()}
    </span>
  );
}
