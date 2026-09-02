/** `null` means the platform does not expose the metric, and must render as N/A. */
export function formatMetric(value: number | null): string {
  if (value === null || value === undefined) return "N/A";
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatCompact(value: number | null): string {
  if (value === null || value === undefined) return "N/A";
  if (Math.abs(value) < 1000) return String(value);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
    .format(value)
    .replace("K", "K")
    .replace("M", "M");
}

export function formatPercent(value: number | null): string {
  if (value === null || value === undefined) return "N/A";
  return `${value.toFixed(2)}%`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

/**
 * A campaign date, always read as the Indian day it was stored as.
 *
 * Without the fixed zone a deadline of the 5th would render as the 4th for anyone whose
 * laptop is set behind IST, and two people would be looking at different dates for the same
 * row — which is exactly what the spreadsheet did wrong.
 */
export function formatDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

/** Whole rupees, grouped the Indian way: 12,50,000 rather than 1,250,000. */
export function formatRupees(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value)}`;
}
