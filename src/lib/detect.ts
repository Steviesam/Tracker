import type { DetectedLink, LinkSource, Platform } from "@/lib/types";

/**
 * Matches anything URL-shaped, plus bare occurrences of the domains we care about
 * (spreadsheets frequently contain "instagram.com/reel/x" with no scheme).
 */
const URL_PATTERN =
  /(?:https?:\/\/|www\.)[^\s"'<>,;()[\]{}\\|]+|(?:instagram\.com|youtube\.com|youtu\.be|facebook\.com|fb\.watch|fb\.me)\/[^\s"'<>,;()[\]{}\\|]*/gi;

const TRAILING_JUNK = /[.,;:!?'"”’)\]}>]+$/;

export type ParsedUrl = {
  platform: Platform;
  canonicalUrl: string;
  externalId: string | null;
  contentType: string;
  creatorHint: string | null;
  /** Short links resolve to a real id only at fetch time, via the provider. */
  needsResolution: boolean;
};

/** Pulls every URL-looking substring out of a piece of text. */
export function extractUrls(text: string): string[] {
  if (!text) return [];
  const matches = text.match(URL_PATTERN);
  if (!matches) return [];
  return matches.map((raw) => raw.replace(TRAILING_JUNK, "").trim()).filter((raw) => raw.length > 0);
}

function toUrl(raw: string): URL | null {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

function platformOf(hostname: string): Platform | null {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  if (host === "instagram.com" || host.endsWith(".instagram.com") || host === "instagr.am") {
    return "INSTAGRAM";
  }
  if (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtu.be" ||
    host === "youtube-nocookie.com"
  ) {
    return "YOUTUBE";
  }
  if (
    host === "facebook.com" ||
    host.endsWith(".facebook.com") ||
    host === "fb.watch" ||
    host === "fb.me"
  ) {
    return "FACEBOOK";
  }
  return null;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function parseInstagram(url: URL): ParsedUrl | null {
  const segments = url.pathname.split("/").filter(Boolean);
  const kindIndex = segments.findIndex((s) => ["p", "reel", "reels", "tv"].includes(s.toLowerCase()));
  if (kindIndex === -1) return null;

  const kind = segments[kindIndex].toLowerCase();
  const code = segments[kindIndex + 1];
  if (!code) return null;

  const type = kind === "p" ? "POST" : kind === "tv" ? "IGTV" : "REEL";
  const pathKind = kind === "reels" ? "reel" : kind;
  return {
    platform: "INSTAGRAM",
    canonicalUrl: `https://www.instagram.com/${pathKind}/${code}/`,
    externalId: code,
    contentType: type,
    // /{username}/reel/{code} carries the handle; the bare /reel/{code} form does not.
    creatorHint: kindIndex > 0 ? segments[0] : null,
    needsResolution: false,
  };
}

function parseYouTube(url: URL): ParsedUrl | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const segments = url.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  let type = "VIDEO";

  if (host === "youtu.be") {
    id = segments[0] ?? null;
  } else if (segments[0] === "watch") {
    id = url.searchParams.get("v");
  } else if (["shorts", "embed", "live", "v"].includes(segments[0]?.toLowerCase() ?? "")) {
    id = segments[1] ?? null;
    if (segments[0].toLowerCase() === "shorts") type = "SHORT";
    if (segments[0].toLowerCase() === "live") type = "LIVE";
  }

  if (!id || !YOUTUBE_ID.test(id)) return null;
  return {
    platform: "YOUTUBE",
    canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
    externalId: id,
    contentType: type,
    creatorHint: null,
    needsResolution: false,
  };
}

function parseFacebook(url: URL): ParsedUrl | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const segments = url.pathname.split("/").filter(Boolean);

  if (host === "fb.watch" || host === "fb.me" || segments[0]?.toLowerCase() === "share") {
    if (segments.length === 0) return null;
    return {
      platform: "FACEBOOK",
      canonicalUrl: `https://${host}/${segments.join("/")}`,
      externalId: null,
      contentType: "VIDEO",
      creatorHint: null,
      needsResolution: true,
    };
  }

  const reelIndex = segments.findIndex((s) => ["reel", "reels"].includes(s.toLowerCase()));
  if (reelIndex !== -1 && segments[reelIndex + 1]) {
    return {
      platform: "FACEBOOK",
      canonicalUrl: `https://www.facebook.com/reel/${segments[reelIndex + 1]}`,
      externalId: segments[reelIndex + 1],
      contentType: "REEL",
      creatorHint: reelIndex > 0 ? segments[0] : null,
      needsResolution: false,
    };
  }

  const videosIndex = segments.findIndex((s) => s.toLowerCase() === "videos");
  if (videosIndex !== -1) {
    // /{page}/videos/{slug}/{id} — the numeric tail is the id.
    const id = [...segments.slice(videosIndex + 1)].reverse().find((s) => /^\d{6,}$/.test(s));
    if (id) {
      return {
        platform: "FACEBOOK",
        canonicalUrl: `https://www.facebook.com/watch/?v=${id}`,
        externalId: id,
        contentType: "VIDEO",
        creatorHint: videosIndex > 0 ? segments[0] : null,
        needsResolution: false,
      };
    }
  }

  if (segments[0]?.toLowerCase() === "watch") {
    const id = url.searchParams.get("v");
    if (id && /^\d{6,}$/.test(id)) {
      return {
        platform: "FACEBOOK",
        canonicalUrl: `https://www.facebook.com/watch/?v=${id}`,
        externalId: id,
        contentType: "VIDEO",
        creatorHint: null,
        needsResolution: false,
      };
    }
  }

  const postsIndex = segments.findIndex((s) => s.toLowerCase() === "posts");
  if (postsIndex !== -1 && segments[postsIndex + 1]) {
    return {
      platform: "FACEBOOK",
      canonicalUrl: `https://www.facebook.com/${segments[0]}/posts/${segments[postsIndex + 1]}`,
      externalId: segments[postsIndex + 1],
      contentType: "POST",
      creatorHint: segments[0],
      needsResolution: false,
    };
  }

  return null;
}

/**
 * Turns a raw string into a supported piece of content, or null when it is not a
 * video/reel/post link we can track (profile pages, hashtags, unrelated domains).
 */
export function parseSocialUrl(raw: string): ParsedUrl | null {
  const url = toUrl(raw);
  if (!url) return null;

  const platform = platformOf(url.hostname);
  if (!platform) return null;

  switch (platform) {
    case "INSTAGRAM":
      return parseInstagram(url);
    case "YOUTUBE":
      return parseYouTube(url);
    case "FACEBOOK":
      return parseFacebook(url);
  }
}

export type CellRef = {
  sheet: string | null;
  row: number | null;
  text: string;
  creatorHint: string | null;
  source: LinkSource;
};

export type DetectionOutcome = {
  links: DetectedLink[];
  totalUrlsFound: number;
  duplicatesRemoved: number;
  unsupportedSkipped: number;
};

/**
 * Scans every cell handed to it, keeping the first occurrence of each unique piece of
 * content. Column position is irrelevant — only the cell contents matter.
 */
export function detectLinks(cells: CellRef[]): DetectionOutcome {
  const seen = new Map<string, DetectedLink>();
  let totalUrlsFound = 0;
  let duplicatesRemoved = 0;
  let unsupportedSkipped = 0;

  for (const cell of cells) {
    for (const raw of extractUrls(cell.text)) {
      totalUrlsFound += 1;
      const parsed = parseSocialUrl(raw);
      if (!parsed) {
        unsupportedSkipped += 1;
        continue;
      }
      if (seen.has(parsed.canonicalUrl)) {
        duplicatesRemoved += 1;
        continue;
      }
      seen.set(parsed.canonicalUrl, {
        id: parsed.canonicalUrl,
        platform: parsed.platform,
        originalUrl: raw,
        canonicalUrl: parsed.canonicalUrl,
        externalId: parsed.externalId,
        contentType: parsed.contentType,
        creatorHint: parsed.creatorHint ?? cell.creatorHint,
        source: cell.source,
        sheet: cell.sheet,
        row: cell.row,
      });
    }
  }

  return { links: [...seen.values()], totalUrlsFound, duplicatesRemoved, unsupportedSkipped };
}

/**
 * Splits a pasted block into candidate URLs. Accepts one per line, comma or semicolon
 * separated, or any mix — each resulting fragment is still scanned for URLs, so
 * surrounding prose is harmless.
 */
export function cellsFromPastedText(text: string): CellRef[] {
  return text
    .split(/[\n\r,;]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => ({ sheet: null, row: null, text: part, creatorHint: null, source: "paste" as const }));
}
