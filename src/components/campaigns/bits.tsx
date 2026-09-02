"use client";

/** Small pieces shared by the campaign list and the workspace, so both read the same. */

import { CAMPAIGN_STATUS_LABEL, INFLUENCER_STATUS_LABEL } from "@/lib/campaigns/status";
import type { CampaignStatus, InfluencerStatus } from "@/lib/campaigns/status";
import { daysFromToday } from "@/lib/campaigns/dates";
import { PAYMENT_LABEL, type PaymentState } from "@/lib/campaigns/payments";
import { formatDay, formatRupees } from "@/lib/format";

const CAMPAIGN_TONE: Record<CampaignStatus, string> = {
  PLANNING: "bg-slate-100 text-slate-700 ring-slate-200",
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  COMPLETED: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  ON_HOLD: "bg-amber-50 text-amber-700 ring-amber-200",
};

/**
 * Stages get warmer as the work gets closer to done, so a column of them can be read at a
 * glance without stopping on each word.
 */
const INFLUENCER_TONE: Record<InfluencerStatus, string> = {
  SELECTED: "bg-slate-100 text-slate-600 ring-slate-200",
  CONTACTED: "bg-sky-50 text-sky-700 ring-sky-200",
  CONFIRMED: "bg-violet-50 text-violet-700 ring-violet-200",
  CONTENT_PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
  APPROVED: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  PUBLISHED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  COMPLETED: "bg-indigo-50 text-indigo-700 ring-indigo-200",
};

export function CampaignBadge({ status }: { status: CampaignStatus }) {
  return <span className={`chip ${CAMPAIGN_TONE[status]}`}>{CAMPAIGN_STATUS_LABEL[status]}</span>;
}

export function StageBadge({ status }: { status: InfluencerStatus }) {
  return <span className={`chip ${INFLUENCER_TONE[status]}`}>{INFLUENCER_STATUS_LABEL[status]}</span>;
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
export function ProgressBar({ value, tone = "indigo" }: { value: number; tone?: "indigo" | "amber" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          tone === "amber" ? "bg-amber-500" : "bg-indigo-500"
        }`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

const PAYMENT_TONE: Record<PaymentState, string> = {
  NO_RATE: "bg-slate-100 text-slate-500 ring-slate-200",
  UNPAID: "bg-rose-50 text-rose-700 ring-rose-200",
  PART_PAID: "bg-amber-50 text-amber-700 ring-amber-200",
  PAID: "bg-emerald-50 text-emerald-700 ring-emerald-200",
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
  const detail =
    state === "PART_PAID"
      ? `${formatRupees(amountPaid)} of ${formatRupees(agreedRate)}`
      : state === "UNPAID" && agreedRate !== null
        ? formatRupees(agreedRate)
        : null;

  return (
    <span className={`chip ${PAYMENT_TONE[state]}`}>
      {PAYMENT_LABEL[state]}
      {detail ? <span className="font-normal tabular-nums">{detail}</span> : null}
    </span>
  );
}

export function Stat({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: number | string;
  tone?: "plain" | "warn" | "good";
}) {
  const colour =
    tone === "warn" ? "text-rose-600" : tone === "good" ? "text-emerald-600" : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <p className="label">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${colour}`}>{value}</p>
    </div>
  );
}
