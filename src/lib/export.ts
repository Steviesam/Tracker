import ExcelJS from "exceljs";
import { creatorKey, type CreatorKey } from "@/lib/creators";
import {
  CREATOR_SAMPLE_SIZE,
  PLATFORM_LABEL,
  type CreatorStats,
  type LinkResult,
} from "@/lib/types";

const HEADERS = [
  "Platform",
  "Creator",
  "URL",
  "Views",
  "Likes",
  "Comments",
  "Shares",
  "Post/Video Date",
  "Title",
  "Content Type",
  "Data Source",
  "Reason (if N/A)",
  "Fetched At",
  "From",
];

/** Only appended when creator stats were actually fetched, so a plain export is unchanged. */
const CREATOR_HEADERS = [
  "Creator Followers",
  `Creator Avg Views (last ${CREATOR_SAMPLE_SIZE})`,
  "Creator Engagement Rate",
];

export type CreatorStatsMap = Record<CreatorKey, CreatorStats>;

const na = (value: number | null): string | number => (value === null ? "N/A" : value);

/** Exports mirror the table exactly: unavailable metrics stay "N/A", never 0. */
function toRow(result: LinkResult, stats: CreatorStatsMap | undefined): Array<string | number> {
  const row: Array<string | number> = [
    PLATFORM_LABEL[result.platform],
    result.creator ?? "N/A",
    result.canonicalUrl,
    na(result.metrics.views),
    na(result.metrics.likes),
    na(result.metrics.comments),
    na(result.metrics.shares),
    result.postedAt ? result.postedAt.slice(0, 10) : "N/A",
    result.title ?? "N/A",
    result.contentType,
    result.provider,
    result.note ?? "",
    result.fetchedAt,
    result.source === "file" ? `${result.sheet ?? ""} row ${result.row ?? ""}`.trim() : "Pasted",
  ];

  if (!stats) return row;

  const creator = result.creatorId
    ? stats[creatorKey(result.platform, result.creatorId)]
    : undefined;

  row.push(
    na(creator?.followers ?? null),
    na(creator?.avgViews ?? null),
    creator?.engagementRate == null ? "N/A" : `${creator.engagementRate.toFixed(2)}%`,
  );
  return row;
}

/** One row per creator, for the separate sheet in the Excel export. */
const CREATOR_SHEET_HEADERS = [
  "Platform",
  "Creator",
  "Profile URL",
  "Followers",
  "Videos Averaged",
  "Avg Views",
  "Avg Likes",
  "Avg Comments",
  "Engagement Rate",
  "Data Source",
  "Reason (if N/A)",
  "Fetched At",
];

function toCreatorRow(creator: CreatorStats): Array<string | number> {
  return [
    PLATFORM_LABEL[creator.platform],
    creator.displayName ?? creator.creatorId,
    creator.profileUrl ?? "N/A",
    na(creator.followers),
    creator.sampleSize,
    na(creator.avgViews),
    na(creator.avgLikes),
    na(creator.avgComments),
    creator.engagementRate === null ? "N/A" : `${creator.engagementRate.toFixed(2)}%`,
    creator.provider,
    creator.note ?? "",
    creator.fetchedAt,
  ];
}

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function hasStats(stats: CreatorStatsMap | undefined): stats is CreatorStatsMap {
  return stats !== undefined && Object.keys(stats).length > 0;
}

export function buildCsv(results: LinkResult[], creatorStats?: CreatorStatsMap): string {
  const stats = hasStats(creatorStats) ? creatorStats : undefined;
  const headers = stats ? [...HEADERS, ...CREATOR_HEADERS] : HEADERS;

  const lines = [headers.join(",")];
  for (const result of results) lines.push(toRow(result, stats).map(escapeCsv).join(","));
  return `\uFEFF${lines.join("\r\n")}`;
}

export async function buildXlsx(
  results: LinkResult[],
  creatorStats?: CreatorStatsMap,
): Promise<Buffer> {
  const stats = hasStats(creatorStats) ? creatorStats : undefined;
  const headers = stats ? [...HEADERS, ...CREATOR_HEADERS] : HEADERS;

  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Results");

  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const result of results) sheet.addRow(toRow(result, stats));

  sheet.columns.forEach((column, index) => {
    column.width = index === 2 ? 52 : Math.max(14, (headers[index]?.length ?? 10) + 4);
  });

  if (stats) {
    const creatorSheet = workbook.addWorksheet("Creators");
    creatorSheet.addRow(CREATOR_SHEET_HEADERS);
    creatorSheet.getRow(1).font = { bold: true };
    creatorSheet.views = [{ state: "frozen", ySplit: 1 }];

    for (const creator of Object.values(stats)) creatorSheet.addRow(toCreatorRow(creator));

    creatorSheet.columns.forEach((column, index) => {
      column.width = index === 2 ? 44 : Math.max(14, (CREATOR_SHEET_HEADERS[index]?.length ?? 10) + 4);
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
