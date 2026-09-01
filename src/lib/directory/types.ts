/**
 * Shapes and constants shared by the directory's server query layer and its UI.
 *
 * Kept free of any Prisma import on purpose: the discovery screen is a client component,
 * and importing the query module there would pull the database client into the browser
 * bundle.
 */

export type DirectoryCreator = {
  id: string;
  username: string;
  displayName: string | null;
  state: string | null;
  city: string | null;
  /** Every category that applies, since a sheet writes them run-on as `Fashion/lifestyle`. */
  niches: string[];
  followers: number | null;
  /** Whether `followers` is the sheet's rounded figure or a live lookup. */
  followersSource: FollowersSource;
  /** ISO timestamp of the live lookup, so a card can say how stale the number is. */
  followersCheckedAt: string | null;
  notes: string | null;
};

export type FollowersSource = "sheet" | "live" | null;

/** One handle's result from a live follower lookup. */
export type LiveFollowers = {
  username: string;
  followers: number | null;
  checkedAt: string | null;
  /** Why this one handle has no live number, when the others do. */
  error: string | null;
};

export type DirectoryFilters = {
  state: string | null;
  city: string | null;
  niche: string | null;
  minFollowers: number | null;
  maxFollowers: number | null;
  /** Free text over username and display name. */
  search: string | null;
};

export type SortKey = "followers" | "username" | "city";

export const SORT_KEYS: SortKey[] = ["followers", "username", "city"];

export type DirectoryPage = {
  creators: DirectoryCreator[];
  total: number;
  page: number;
  pageSize: number;
};

/** A dropdown option and how many creators picking it would return. */
export type Facet = { value: string; count: number };

export type Facets = {
  states: Facet[];
  /** Cities grouped by state, so picking a state narrows the city list to real options. */
  citiesByState: Record<string, Facet[]>;
  /** Ordered by how many creators each category has, not alphabetically. */
  niches: Facet[];
  total: number;
};

/**
 * The bands the influencer-marketing industry works in. Offered as presets because
 * "creators between 10K and 100K" is the question people actually ask; the sort and search
 * are still there for anything more specific.
 */
export const FOLLOWER_BANDS: Array<{ id: string; label: string; min: number; max: number | null }> =
  [
    { id: "nano", label: "Nano · under 10K", min: 0, max: 10_000 },
    { id: "micro", label: "Micro · 10K – 100K", min: 10_000, max: 100_000 },
    { id: "mid", label: "Mid · 100K – 500K", min: 100_000, max: 500_000 },
    { id: "macro", label: "Macro · 500K – 1M", min: 500_000, max: 1_000_000 },
    { id: "mega", label: "Mega · 1M+", min: 1_000_000, max: null },
  ];

export const PAGE_SIZE = 24;

/**
 * Handles per live-refresh call. One screenful, so "refresh what I am looking at" is a
 * single request; more than that and the cost stops being obvious from what is on screen.
 */
export const MAX_REFRESH = PAGE_SIZE;

/** What one tab of the workbook contributed, so gaps in coverage are visible. */
export type SheetReport = {
  sheet: string;
  /** Header rows found. More than one means the tab stacks several tables. */
  blocks: number;
  /** Data rows under a header. */
  rows: number;
  /** Rows with a readable handle. */
  accepted: number;
  /** Rows above the first header, which cannot be read without knowing the columns. */
  skippedBeforeHeader: number;
};

export type ImportSummary = {
  sheets: SheetReport[];
  rowsRead: number;
  /** Distinct creators across the whole file. */
  accepted: number;
  /** Rows dropped because no readable Instagram handle was present. */
  skippedNoUsername: number;
  /** Later rows for a handle already seen in this file; the last one wins. */
  duplicatesInFile: number;
  /**
   * Cells that had a follower value we could not read — free text, or a number far too
   * large to be an audience. Those creators are stored with followers as N/A.
   */
  unreadableFollowers: number;
  /**
   * Creators whose state the sheet left blank and we filled in from a city we recognise.
   * A state the sheet named is never overwritten.
   */
  statesDerived: number;
  imported: number;
  /** Fields recognised anywhere in the file, so a missing one is obvious. */
  fieldsFound: string[];
  /** Headers we did not recognise. Their values are kept in notes. */
  unmapped: string[];
};

export const EMPTY_FILTERS: DirectoryFilters = {
  state: null,
  city: null,
  niche: null,
  minFollowers: null,
  maxFollowers: null,
  search: null,
};
