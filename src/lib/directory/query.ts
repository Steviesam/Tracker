import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  PAGE_SIZE,
  type DirectoryFilters,
  type DirectoryPage,
  type Facets,
  type SortKey,
} from "@/lib/directory/types";

function whereFrom(filters: DirectoryFilters): Prisma.CreatorWhereInput {
  const where: Prisma.CreatorWhereInput = {};

  if (filters.state) where.state = filters.state;
  if (filters.city) where.city = filters.city;
  // A creator carries every category that applies, so "Lifestyle" must also match the ones
  // whose sheet said `Fashion/lifestyle/ugc`.
  if (filters.niche) where.niches = { has: filters.niche };

  if (filters.minFollowers !== null || filters.maxFollowers !== null) {
    where.followers = {
      ...(filters.minFollowers !== null ? { gte: filters.minFollowers } : {}),
      ...(filters.maxFollowers !== null ? { lte: filters.maxFollowers } : {}),
    };
  }

  if (filters.search) {
    where.OR = [
      { username: { contains: filters.search, mode: "insensitive" } },
      { displayName: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return where;
}

const ORDER: Record<SortKey, Prisma.CreatorOrderByWithRelationInput[]> = {
  // Creators with no follower count sort last: an unknown is not a small audience.
  followers: [{ followers: { sort: "desc", nulls: "last" } }, { username: "asc" }],
  username: [{ username: "asc" }],
  city: [{ city: { sort: "asc", nulls: "last" } }, { username: "asc" }],
};

export async function findCreators(
  filters: DirectoryFilters,
  options: { page?: number; sort?: SortKey } = {},
): Promise<DirectoryPage> {
  const page = Math.max(0, options.page ?? 0);
  const where = whereFrom(filters);

  const [creators, total] = await Promise.all([
    prisma.creator.findMany({
      where,
      orderBy: ORDER[options.sort ?? "followers"],
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        username: true,
        displayName: true,
        state: true,
        city: true,
        niches: true,
        followers: true,
        notes: true,
      },
    }),
    prisma.creator.count({ where }),
  ]);

  return { creators, total, page, pageSize: PAGE_SIZE };
}

/**
 * The values that actually exist in the directory, used to build the dropdowns.
 *
 * Offering only real values is what stops the user selecting "Bihar + Mumbai" and getting
 * an empty screen with no explanation.
 */
export async function facets(): Promise<Facets> {
  // Each option carries how many creators it would return. A category matching four people
  // and one matching 1,400 look identical in a plain alphabetical list, and the user has to
  // select one to find out; the count says so up front.
  const [states, cities, niches, total] = await Promise.all([
    prisma.$queryRaw<Array<{ value: string; count: bigint }>>`
      SELECT state AS value, count(*) AS count
      FROM "Creator"
      WHERE state IS NOT NULL
      GROUP BY state
      ORDER BY state ASC
    `,
    prisma.$queryRaw<Array<{ state: string; value: string; count: bigint }>>`
      SELECT coalesce(state, '') AS state, city AS value, count(*) AS count
      FROM "Creator"
      WHERE city IS NOT NULL
      GROUP BY 1, 2
      ORDER BY 2 ASC
    `,
    // unnest turns the tag arrays into one row per creator per tag, which is what makes the
    // count per category correct rather than a count of exact spellings.
    prisma.$queryRaw<Array<{ value: string; count: bigint }>>`
      SELECT tag AS value, count(*) AS count
      FROM "Creator", unnest(niches) AS tag
      GROUP BY tag
      ORDER BY count DESC, tag ASC
    `,
    prisma.creator.count(),
  ]);

  const citiesByState: Record<string, Array<{ value: string; count: number }>> = {};
  for (const row of cities) {
    // Cities with no state still need to be selectable, so they go under a shared key.
    (citiesByState[row.state] ??= []).push({ value: row.value, count: Number(row.count) });
  }

  const counted = (rows: Array<{ value: string; count: bigint }>) =>
    rows.map((row) => ({ value: row.value, count: Number(row.count) }));

  return {
    states: counted(states),
    citiesByState,
    niches: counted(niches),
    total,
  };
}
