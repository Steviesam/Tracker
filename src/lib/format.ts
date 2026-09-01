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
