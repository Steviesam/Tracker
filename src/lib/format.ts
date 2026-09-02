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

/**
 * Digits as a phone number a person can read back: `+91 98765 43210`, `98765 43210`.
 *
 * Storage keeps digits only, which is what `tel:` and WhatsApp want, but an unbroken
 * `919876543210` is hard to check against a contact list — which is exactly what someone
 * does before dialling a number they have not called before.
 */
export function formatPhone(digits: string): string {
  if (digits.length === 12 && digits.startsWith("91")) {
    const local = digits.slice(2);
    return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  return `+${digits}`;
}

/**
 * A number without a country code is a domestic one, so `tel:` gets it as written — a
 * leading `+` would send it abroad.
 */
export function telHref(digits: string): string {
  return digits.length <= 10 ? `tel:${digits}` : `tel:+${digits}`;
}

/**
 * WhatsApp has no domestic mode: every link needs a country code, so a bare ten-digit
 * number has to be given one. India is the assumption everywhere else in this app — the
 * prices are in rupees and the directory is filtered by Indian states — so it is the
 * assumption here too. The stored number is left alone; only the link gets the prefix.
 */
export function whatsAppHref(digits: string): string {
  return `https://wa.me/${digits.length <= 10 ? `91${digits}` : digits}`;
}
