/**
 * One way to call an Apify actor and read its dataset.
 *
 * Both the creator-stats provider and the directory's live follower lookup need this, and
 * a second copy would drift on timeouts and error handling.
 */

export type ApifyItem = Record<string, unknown>;

const RUN_TIMEOUT_MS = 180_000;

export async function runActor(
  actorId: string,
  token: string,
  input: unknown,
): Promise<ApifyItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `${response.status} ${response.statusText}${detail ? ` — ${detail.slice(0, 160)}` : ""}`,
      );
    }
    const body = await response.json();
    return Array.isArray(body) ? (body as ApifyItem[]) : [];
  } finally {
    clearTimeout(timer);
  }
}
