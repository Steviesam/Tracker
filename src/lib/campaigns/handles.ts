/**
 * Reading pasted accounts onto a campaign.
 *
 * This is stricter than the engagement screen's parser on purpose. There, a word that turns
 * out not to be an account costs one wasted lookup and shows an error. Here it becomes a row
 * in the campaign that somebody has to notice and delete: pasting "not a handle" created two
 * influencers called "not" and "a", because both are things an Instagram handle could be.
 *
 * So a bare word is only an account when it is written as one, with an "@". Anything else has
 * to be a link, which cannot be typed by accident.
 */

import { resolveCreatorInput } from "@/lib/creators/resolve";
import type { CampaignPlatform } from "@/lib/campaigns/status";

export type ParsedHandle = { platform: CampaignPlatform; handle: string };

export type ParsedPaste = { influencers: ParsedHandle[]; rejected: string[] };

function looksLikeUrl(token: string): boolean {
  return /^(https?:\/\/|www\.)/i.test(token) || /\.(com|be|am|tv)\b/i.test(token);
}

/**
 * Stores the handle in the form its provider expects.
 *
 * Instagram is case-insensitive and never keeps the "@", so it is lowercased bare. YouTube
 * is two different things wearing one field: "@name" is a handle the API resolves, while
 * "UC…" is a channel id whose capitals are load-bearing and must survive untouched.
 */
export function normaliseHandle(platform: CampaignPlatform, raw: string): string {
  if (platform === "instagram") return raw.replace(/^@/, "").toLowerCase();
  return raw.startsWith("@") ? raw.toLowerCase() : raw;
}

/** How a stored handle is written on screen. */
export function displayHandle(platform: CampaignPlatform, handle: string): string {
  if (platform === "instagram") return `@${handle}`;
  return handle.startsWith("@") ? handle : handle;
}

export function parsePaste(text: string): ParsedPaste {
  const influencers = new Map<string, ParsedHandle>();
  const rejected: string[] = [];

  for (const token of text.split(/[\n\r,;]+/).map((part) => part.trim()).filter(Boolean)) {
    // A line can hold several things; each is judged on its own.
    for (const piece of token.split(/\s+/).filter(Boolean)) {
      if (!piece.startsWith("@") && !looksLikeUrl(piece)) {
        rejected.push(piece);
        continue;
      }

      const resolved = resolveCreatorInput(piece);

      // A post or reel link names a piece of content, and finding its owner costs a provider
      // call. That is the engagement screen's job, not a campaign's roster.
      if (resolved.refs.length === 0) {
        rejected.push(piece);
        continue;
      }

      for (const ref of resolved.refs) {
        const platform: CampaignPlatform = ref.platform === "YOUTUBE" ? "youtube" : "instagram";
        const handle = normaliseHandle(platform, ref.creatorId);
        influencers.set(`${platform}:${handle}`, { platform, handle });
      }
    }
  }

  return { influencers: [...influencers.values()], rejected };
}
