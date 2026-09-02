import { canonicalCity, canonicalState, stateForCity } from "@/lib/directory/india";

/**
 * Turns raw spreadsheet cells into the directory's canonical shapes.
 *
 * Real sheets are messy: handles arrive as "@name", as a full profile URL, or bare;
 * follower counts as "1.2M", "45,000" or "45k"; and the same city as "patna", "Patna" and
 * "PATNA". Canonicalising on the way in is what makes the filters and the dropdowns work —
 * otherwise one city would appear three times in the list and each would match a third of
 * the rows.
 */

/** Instagram handles: letters, digits, dots and underscores, up to 30 characters. */
const HANDLE = /^[a-z0-9._]{1,30}$/;

const RESERVED_PATHS = new Set(["p", "reel", "reels", "tv", "stories", "explore", "s"]);

/**
 * Extracts an Instagram handle from a spreadsheet cell.
 *
 * Cells in real sheets are rarely a bare handle. A linked cell flattens to its display text
 * followed by the URL ("chennai vibes https://instagram.com/chennaivibes/"); handles get
 * pasted with a trailing slash, an "@", or a tracking query string. Each of those is a
 * legitimate row that should not be lost to formatting, so they are all read.
 *
 * Returns null when nothing usable is present, so the row is reported as skipped rather
 * than imported under a wrong handle.
 */
export function toUsername(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  // A URL is the most reliable signal, so it wins over any text sharing the cell.
  const url = value.match(/instagram\.com\/+([^/?#\s]+)/i);
  if (url) {
    const segment = url[1].toLowerCase();
    // Post and reel URLs identify content, not an account, so they cannot seed a row.
    if (RESERVED_PATHS.has(segment)) return null;
    return HANDLE.test(segment) ? segment : null;
  }

  // A cell that mentions Instagram but carries no readable profile path is not usable.
  if (/instagram\.com/i.test(value)) return null;

  const mention = value.match(/@([a-zA-Z0-9._]{1,30})/);
  if (mention) {
    const handle = mention[1].toLowerCase().replace(/\.+$/, "");
    return HANDLE.test(handle) ? handle : null;
  }

  // The whole cell must be the handle. Taking the first word instead would turn a junk cell
  // like "not a handle!" into a creator called "not".
  const bare = value
    .replace(/^\/+|\/+$/g, "")
    .split(/[?#]/)[0]
    .trim()
    .toLowerCase();
  return HANDLE.test(bare) ? bare : null;
}

const MULTIPLIER: Record<string, number> = { k: 1_000, m: 1_000_000, b: 1_000_000_000 };

/**
 * Above this, the number is not a follower count.
 *
 * The largest account on Instagram is around 700 million. A ten-digit Indian mobile number
 * is between 6 and 10 billion, and those turn up in follower columns whenever a row is
 * mis-keyed or a phone column drifts. Accepting one would both overflow the database column
 * and, worse, hand every "Mega · 1M+" search a creator who does not exist at that size.
 */
const MAX_FOLLOWERS = 1_000_000_000;

/**
 * Parses a follower count. Returns null rather than 0 for anything unreadable — 0 would
 * quietly place the creator at the bottom of every range filter as though it were a fact.
 */
export function toFollowers(raw: string | number): number | null {
  const parsed = parse(raw);
  if (parsed === null) return null;
  return parsed <= MAX_FOLLOWERS ? parsed : null;
}

function parse(raw: string | number): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : null;
  }

  const value = raw.trim().toLowerCase().replace(/[,\s]/g, "");
  if (!value) return null;

  const match = value.match(/^([0-9]*\.?[0-9]+)([kmb])?\+?$/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;

  const scale = match[2] ? MULTIPLIER[match[2]] : 1;
  return Math.round(amount * scale);
}

/**
 * Reads an email address out of a cell.
 *
 * Cells hold more than one often enough to matter ("a@b.com / manager@c.com", or an address
 * with a name in front of it), so the first well-formed address wins rather than the cell
 * being rejected whole. Lowercased, because the same person arrives capitalised differently
 * on each sheet and two spellings of one address are worse than none.
 */
export function toEmail(raw: string): string | null {
  const match = raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

/**
 * Reads a phone number, returning digits only with the country code when there was one.
 *
 * Sheets write the same number as "+91 98765 43210", "098765-43210", "9876543210" and
 * "91 9876543210". They also write things that are not phone numbers at all in the phone
 * column — "NA", a landline extension, a WhatsApp group link. The length bounds below are
 * what separate the two: anything outside them is dropped rather than stored, because a
 * `tel:` link to a broken number wastes more time than an empty field does.
 *
 * A leading zero is Indian trunk dialling and means nothing to a phone that is not on the
 * domestic network, so it goes; the country code is kept exactly as given, and never
 * invented, since a number saved under the wrong country dials a stranger.
 */
export function toPhone(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  // An extension turns one number into two, and we cannot dial the second half anyway.
  const first = value.split(/[,;/]|\bext\b|\bx\b/i)[0];
  const digits = first.replace(/\D/g, "");
  if (!digits) return null;

  const trimmed = digits.replace(/^0+/, "");
  // 10 is a bare Indian mobile; 15 is the international maximum under E.164.
  if (trimmed.length < 10 || trimmed.length > 15) return null;

  // All one digit is how "0000000000" and "9999999999" get typed to mean "no number".
  if (/^(\d)\1+$/.test(trimmed)) return null;

  return trimmed;
}

/**
 * Above this, the cell is not a rate.
 *
 * A crore for one post is already far beyond what anyone in this directory charges, so a
 * larger number is a mis-keyed cell — most often a phone number, which is exactly the shape
 * that would otherwise sail through and overflow the column.
 */
const MAX_RATE = 10_00_00_000;

const RUPEE_SCALE: Record<string, number> = {
  k: 1_000,
  l: 1_00_000,
  lac: 1_00_000,
  lakh: 1_00_000,
  lakhs: 1_00_000,
  m: 10_00_000,
  cr: 1_00_00_000,
  crore: 1_00_00_000,
  crores: 1_00_00_000,
};

/**
 * Parses what a creator charges, in whole rupees.
 *
 * Rate columns are written for humans: "₹50,000", "50k", "1.5 lakh", "50000/reel",
 * "Rs. 25,000 per post". The number and its scale are what matter; the currency mark and
 * whatever the rate is *per* are stripped, since the directory holds one price per creator
 * and nothing downstream reads the unit.
 *
 * Returns null for anything unreadable rather than 0, which would read as "works for free".
 */
export function toRupees(raw: string | number): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 && raw <= MAX_RATE ? Math.round(raw) : null;
  }

  const value = raw
    .toLowerCase()
    .replace(/[₹,]/g, "")
    .replace(/\b(?:rs|inr)\b\.?\s*/g, " ")
    // "per reel", "/post", "for 1 reel" — the unit, not the price.
    .replace(/(per|\/|for)\s*\d*\s*[a-z]+/g, " ")
    // Whatever prefix survived the two rules above. A rate column holds prices, and the
    // words in front of one ("approx", "starting") do not change the number behind it.
    .replace(/^[^\d]+/, "")
    .trim();

  const match = value.match(/^([0-9]*\.?[0-9]+)\s*(k|l|lac|lakhs?|m|cr|crores?)?\b/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const scaled = Math.round(amount * (match[2] ? RUPEE_SCALE[match[2]] : 1));
  return scaled > 0 && scaled <= MAX_RATE ? scaled : null;
}

/** Words kept lowercase mid-phrase, so "City Of Patna" does not out-shout the place name. */
const MINOR_WORDS = new Set(["of", "and", "the", "in", "at", "de", "da"]);

/**
 * Words that stay upper-case because title-casing them reads as a mistake.
 *
 * Deliberately a short, explicit list rather than a rule like "keep any short all-caps
 * word". Such a rule would preserve "GOA" while title-casing "Goa", and the two would then
 * sit in the filter as separate places matching separate halves of the data.
 */
const ACRONYMS = new Set(["ncr", "ugc", "ott", "fmcg", "b2b", "b2c", "diy", "hnw", "nri"]);

/**
 * Gives a label one canonical form, for display and — more importantly — for grouping.
 *
 * The same city arrives as "patna", "Patna" and "PATNA" in a sheet maintained by several
 * people. Without this the filter would offer three entries, each matching a third of the
 * rows, and every one of them would look broken.
 */
export function toLabel(raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return null;

  return value
    .split(" ")
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      // Two-letter forms are state abbreviations here (UP, MP, TN); no place is spelled out
      // in two letters, so upper-casing them cannot collide with a real name.
      if (lower.length <= 2 && index === 0) return lower.toUpperCase();
      if (index > 0 && MINOR_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function profileUrl(username: string): string {
  return `https://www.instagram.com/${username}/`;
}

export type Place = {
  state: string | null;
  city: string | null;
  /** True when the state came from the city rather than from the sheet. */
  stateDerived: boolean;
};

/** "Mumbai, Maharashtra" and "Kochi / Kerala" both name two places in one cell. */
function parts(raw: string): string[] {
  return raw
    .split(/[,/|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Sorts whatever the sheet put in its State and City columns into the right one.
 *
 * Three things go wrong in real sheets, and all three end with the State filter listing
 * cities and the City filter listing states:
 *
 * - a block has a City column and no State column at all;
 * - a city name is typed under State, or a state name under City;
 * - both sit in one cell, as "Patna, Bihar".
 *
 * A state named by the sheet always wins. One is only *derived* from the city when the
 * sheet gave none, and that case is reported back to the user rather than done silently.
 */
export function resolvePlace(rawState: string, rawCity: string): Place {
  let state: string | null = null;
  let city: string | null = null;
  const unplaced: string[] = [];

  // The City column is read first: when a cell holds both, the city is the specific half,
  // and the state it implies is recovered either way.
  for (const part of [...parts(rawCity), ...parts(rawState)]) {
    const asState = canonicalState(part);
    if (asState) {
      state ??= asState;
      continue;
    }

    const asCity = canonicalCity(part);
    if (asCity) {
      city ??= asCity;
      continue;
    }

    unplaced.push(part);
  }

  // Anything we do not recognise is still the user's data. It fills whichever column is
  // still empty, preferring city, since that is the more specific of the two.
  for (const part of unplaced) {
    if (!city) city = toLabel(part);
    else if (!state) state = toLabel(part);
  }

  let stateDerived = false;
  if (!state && city) {
    const derived = stateForCity(city);
    if (derived) {
      state = derived;
      stateDerived = true;
    }
  }

  return { state, city, stateDerived };
}
