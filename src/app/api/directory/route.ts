import { NextResponse, type NextRequest } from "next/server";
import { facets, findCreators } from "@/lib/directory/query";
import { SORT_KEYS, type DirectoryFilters, type SortKey } from "@/lib/directory/types";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";

function text(params: URLSearchParams, key: string): string | null {
  const value = params.get(key)?.trim();
  return value ? value.slice(0, 120) : null;
}

function count(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

/** Filtered directory search, plus the dropdown values on the first page. */
export async function GET(request: NextRequest) {
  const auth = await requireSession();
  if (auth.response) return auth.response;

  const params = request.nextUrl.searchParams;

  const filters: DirectoryFilters = {
    state: text(params, "state"),
    city: text(params, "city"),
    niche: text(params, "niche"),
    minFollowers: count(params, "minFollowers"),
    maxFollowers: count(params, "maxFollowers"),
    search: text(params, "search"),
  };

  const requestedSort = params.get("sort") as SortKey | null;
  const sort = requestedSort && SORT_KEYS.includes(requestedSort) ? requestedSort : "followers";
  const page = count(params, "page") ?? 0;

  try {
    // The dropdown values only change on import, so they are fetched once per session
    // rather than with every filter change.
    const wantsFacets = params.get("facets") === "1";
    const [result, options] = await Promise.all([
      findCreators(filters, { page, sort }),
      wantsFacets ? facets() : Promise.resolve(null),
    ]);

    return NextResponse.json({ ...result, facets: options });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Directory query failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
