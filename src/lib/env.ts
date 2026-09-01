/**
 * All configuration comes from the environment. Nothing sensitive is committed.
 * See .env.example for the full list.
 */

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function required(name: string): string {
  const value = optional(name);
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

export function sessionSecret(): string {
  const secret = required("APP_SESSION_SECRET");
  if (secret.length < 32) {
    throw new Error("APP_SESSION_SECRET must be at least 32 characters.");
  }
  return secret;
}

export function databaseUrl(): string {
  return required("DATABASE_URL");
}

export function maxUploadBytes(): number {
  const raw = optional("MAX_UPLOAD_MB");
  const mb = raw ? Number(raw) : 15;
  return (Number.isFinite(mb) && mb > 0 ? mb : 15) * 1024 * 1024;
}

/** Official YouTube Data API v3 key. Reads any public video. */
export function youtubeApiKey(): string | undefined {
  return optional("YOUTUBE_API_KEY");
}

/** Instagram Graph API token plus the caller's own professional account id. */
export function instagramAccessToken(): string | undefined {
  return optional("INSTAGRAM_ACCESS_TOKEN");
}

export function instagramUserId(): string | undefined {
  return optional("INSTAGRAM_USER_ID");
}

/**
 * Token for the oEmbed endpoint, used to resolve a post URL to its creator's username so
 * the user never has to supply handles. Falls back to INSTAGRAM_ACCESS_TOKEN when unset;
 * an app token ("{app-id}|{client-token}") is the usual choice.
 */
export function instagramOembedToken(): string | undefined {
  return optional("INSTAGRAM_OEMBED_TOKEN");
}

/** Facebook Page access token. Only reads Pages this token manages. */
export function facebookAccessToken(): string | undefined {
  return optional("FACEBOOK_ACCESS_TOKEN");
}

export type ApifyConfig = {
  token: string;
  instagramActor?: string;
  facebookActor?: string;
  /** Account-level stats. Optional: without these, per-link metrics still work. */
  instagramReelsActor?: string;
  instagramProfileActor?: string;
};

/**
 * Optional third-party public-data provider. Off unless a token and at least one actor
 * are configured — it is never enabled implicitly.
 */
export function apifyConfig(): ApifyConfig | null {
  const token = optional("APIFY_TOKEN");
  if (!token) return null;

  const instagramActor = optional("APIFY_INSTAGRAM_ACTOR");
  const facebookActor = optional("APIFY_FACEBOOK_ACTOR");
  const instagramReelsActor = optional("APIFY_INSTAGRAM_REELS_ACTOR");
  const instagramProfileActor = optional("APIFY_INSTAGRAM_PROFILE_ACTOR");
  if (!instagramActor && !facebookActor && !instagramReelsActor) return null;

  return { token, instagramActor, facebookActor, instagramReelsActor, instagramProfileActor };
}
