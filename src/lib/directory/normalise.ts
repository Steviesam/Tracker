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
