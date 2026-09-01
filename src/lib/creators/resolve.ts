import { parseSocialUrl } from "@/lib/detect";
import type { Platform } from "@/lib/types";

/**
 * Turns whatever someone pastes into the accounts to look up.
 *
 * The engagement figures are about an account, not a post, so a profile link or a handle is
 * the natural thing to paste — but people paste the reel that made them curious just as
 * often. Both are accepted: a handle is free to resolve, while a post link needs the same
 * provider call the metrics table already makes, so those are separated out and answered by
 * the caller rather than resolved here.
 */

export type CreatorRef = { platform: Platform; creatorId: string };

export type Resolution = {
  /** Ready to look up, no further calls needed. */
  refs: CreatorRef[];
  /** Post and video links whose owner is only known after the provider answers. */
  contentUrls: string[];
  /** Kept verbatim so the UI can say which line it could not use. */
  rejected: string[];
};

/**
 * Instagram path segments that are pages rather than accounts. Without this, "explore" and
 * "stories" would be looked up as if they were creators and reported as missing accounts.
 */
const IG_RESERVED = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "stories",
  "explore",
  "direct",
  "accounts",
  "about",
  "developer",
  "legal",
  "privacy",
  "terms",
  "challenge",
  "s",
  "web",
]);

const IG_HANDLE = /^[A-Za-z0-9._]{1,30}$/;
const YT_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

/** Splits on the separators a pasted list realistically uses, keeping URLs intact. */
function lines(text: string): string[] {
  return text
    .split(/[\n\r,;\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function asUrl(raw: string): URL | null {
  if (!/^(https?:\/\/|www\.)/i.test(raw) && !/\.(com|be|am)\//i.test(raw)) return null;
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}

function host(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

/** A profile link, or null when the URL points at something other than an account page. */
function profileFrom(url: URL): CreatorRef | null {
  const segments = url.pathname.split("/").filter(Boolean);
  const name = segments[0];
  if (!name) return null;

  const site = host(url);

  if (site === "instagram.com" || site.endsWith(".instagram.com") || site === "instagr.am") {
    // A post link carrying its owner — /{username}/reel/{code} — is a profile link too, and
    // resolving it here saves the lookup that the bare /reel/{code} form would need.
    if (IG_RESERVED.has(name.toLowerCase())) return null;
    return IG_HANDLE.test(name) ? { platform: "INSTAGRAM", creatorId: name } : null;
  }

  if (site === "youtube.com" || site.endsWith(".youtube.com")) {
    if (name.startsWith("@")) return { platform: "YOUTUBE", creatorId: name };
    if (segments[0] === "channel" && segments[1] && YT_CHANNEL_ID.test(segments[1])) {
      return { platform: "YOUTUBE", creatorId: segments[1] };
    }
    return null;
  }

  return null;
}

/**
 * Reads a pasted block into accounts.
 *
 * A bare handle with no domain is taken as Instagram: this app's directory and its whole
 * creator side are Instagram-first, and "@name" is far more likely to be an Instagram
 * handle than a YouTube one. A YouTube account needs its URL, which is unambiguous.
 */
export function resolveCreatorInput(text: string): Resolution {
  const refs = new Map<string, CreatorRef>();
  const contentUrls = new Set<string>();
  const rejected: string[] = [];

  for (const raw of lines(text)) {
    const url = asUrl(raw);

    if (url) {
      const profile = profileFrom(url);
      if (profile) {
        refs.set(`${profile.platform}:${profile.creatorId}`, profile);
        continue;
      }
      const parsed = parseSocialUrl(raw);
      // Facebook is excluded upstream — see lib/creators/index.ts — so a Facebook link is
      // rejected here rather than costing a lookup that cannot produce an account.
      if (parsed && parsed.platform !== "FACEBOOK") {
        contentUrls.add(parsed.canonicalUrl);
        continue;
      }
      rejected.push(raw);
      continue;
    }

    const handle = raw.replace(/^@/, "");
    if (IG_HANDLE.test(handle)) {
      refs.set(`INSTAGRAM:${handle}`, { platform: "INSTAGRAM", creatorId: handle });
      continue;
    }

    rejected.push(raw);
  }

  return { refs: [...refs.values()], contentUrls: [...contentUrls], rejected };
}
