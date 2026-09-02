import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  isBlankRow,
  looksLikeHeaderRow,
  mapColumns,
  type ColumnMap,
} from "@/lib/directory/columns";
import { toNiches } from "@/lib/directory/niches";
import {
  resolvePlace,
  toEmail,
  toFollowers,
  toLabel,
  toPhone,
  toRupees,
  toUsername,
} from "@/lib/directory/normalise";
import type { ImportSummary } from "@/lib/directory/types";
import { readSheets } from "@/lib/parse";

export type CreatorRecord = {
  username: string;
  displayName: string | null;
  state: string | null;
  city: string | null;
  niches: string[];
  followers: number | null;
  email: string | null;
  phone: string | null;
  rateCard: number | null;
  notes: string | null;
};

/** Values not worth storing as a label, however they were spelled in the sheet. */
const BLANKS = new Set(["", "-", "--", "n/a", "na", "none", "null", "nil", "unknown", "#n/a"]);

function cell(row: string[], index: number | undefined): string {
  if (index === undefined) return "";
  const value = row[index];
  if (!value) return "";
  return BLANKS.has(value.trim().toLowerCase()) ? "" : value.trim();
}

type RowTally = {
  unreadableFollowers: () => void;
  stateDerived: () => void;
};

function toRecord(row: string[], columns: ColumnMap, tally: RowTally): CreatorRecord | null {
  const username = toUsername(cell(row, columns.fields.username));
  if (!username) return null;

  const rawFollowers = cell(row, columns.fields.followers);
  const followers = toFollowers(rawFollowers);
  if (rawFollowers && followers === null) tally.unreadableFollowers();

  const place = resolvePlace(cell(row, columns.fields.state), cell(row, columns.fields.city));
  if (place.stateDerived) tally.stateDerived();

  const rawEmail = cell(row, columns.fields.email);
  const rawPhone = cell(row, columns.fields.phone);
  const rawRate = cell(row, columns.fields.rateCard);

  const email = toEmail(rawEmail);
  const phone = toPhone(rawPhone);
  const rateCard = toRupees(rawRate);

  const notes = columns.extras
    .map((index) => {
      const value = cell(row, index);
      if (!value) return null;
      const header = columns.headers[index]?.trim();
      return header ? `${header}: ${value}` : value;
    })
    .filter((entry): entry is string => entry !== null)
    // A contact column that held something we could not read — a landline with an
    // extension, "DM only", a rate written as "negotiable" — is still what the sheet knew
    // about this creator. It goes to notes rather than being thrown away, because the
    // alternative is a blank field and no way to find out why.
    .concat(
      [
        rawEmail && !email ? `Email: ${rawEmail}` : null,
        rawPhone && !phone ? `Phone: ${rawPhone}` : null,
        rawRate && rateCard === null ? `Rate: ${rawRate}` : null,
      ].filter((entry): entry is string => entry !== null),
    )
    .join(" · ");

  return {
    username,
    displayName: toLabel(cell(row, columns.fields.displayName)),
    state: place.state,
    city: place.city,
    niches: toNiches(cell(row, columns.fields.niche)),
    followers,
    email,
    phone,
    rateCard,
    notes: notes.length > 0 ? notes.slice(0, 500) : null,
  };
}

/**
 * Reads every sheet in the file into records.
 *
 * Sheets that people actually maintain are not one clean table. A single tab often stacks
 * several tables, separated by blank rows, each repeating a header with its own column
 * layout — one block for Chennai with a language column, another further down without it.
 * So every row is tested as a possible header, and the most recent header governs the rows
 * beneath it. Reading only the first row would import one block and silently drop the rest,
 * which is exactly how a 5,000-row sheet turns into 84 creators.
 *
 * Rows before any header are skipped rather than guessed at: importing thousands of rows
 * against the wrong column is far more work to undo than to re-upload with a clearer sheet.
 */
export async function readCreators(
  buffer: Buffer,
  filename: string,
): Promise<{ records: CreatorRecord[]; summary: Omit<ImportSummary, "imported"> }> {
  const sheets = await readSheets(buffer, filename);

  const byUsername = new Map<string, CreatorRecord>();
  const sheetReports: ImportSummary["sheets"] = [];
  const fieldsFound = new Set<string>();
  const unmapped = new Set<string>();

  let rowsRead = 0;
  let skippedNoUsername = 0;
  let duplicatesInFile = 0;
  let unreadableFollowers = 0;
  let statesDerived = 0;

  for (const { sheet, rows } of sheets) {
    let columns: ColumnMap | null = null;
    let blocks = 0;
    let accepted = 0;
    let sheetRows = 0;
    let beforeHeader = 0;

    for (const row of rows) {
      if (isBlankRow(row)) continue;

      if (looksLikeHeaderRow(row)) {
        columns = mapColumns(row);
        blocks += 1;
        for (const field of Object.keys(columns.fields)) fieldsFound.add(field);
        for (const index of columns.extras) {
          const header = columns.headers[index]?.trim();
          if (header) unmapped.add(header);
        }
        continue;
      }

      if (!columns) {
        beforeHeader += 1;
        continue;
      }

      sheetRows += 1;
      const record = toRecord(row, columns, {
        unreadableFollowers: () => {
          unreadableFollowers += 1;
        },
        stateDerived: () => {
          statesDerived += 1;
        },
      });
      if (!record) {
        skippedNoUsername += 1;
        continue;
      }
      if (byUsername.has(record.username)) duplicatesInFile += 1;
      byUsername.set(record.username, record);
      accepted += 1;
    }

    rowsRead += sheetRows;
    sheetReports.push({ sheet, blocks, rows: sheetRows, accepted, skippedBeforeHeader: beforeHeader });
  }

  return {
    records: [...byUsername.values()],
    summary: {
      sheets: sheetReports,
      rowsRead,
      accepted: byUsername.size,
      skippedNoUsername,
      duplicatesInFile,
      unreadableFollowers,
      statesDerived,
      fieldsFound: [...fieldsFound],
      unmapped: [...unmapped],
    },
  };
}

/**
 * Rows per statement. Postgres caps a query at 65,535 bind parameters, and each row here
 * binds twelve, so 500 leaves ample headroom while keeping a 10,000-row import to 20 round
 * trips rather than 10,000.
 */
const CHUNK = 500;

/**
 * Upserts by username, so re-uploading a corrected sheet updates rows in place instead of
 * creating duplicates.
 *
 * A field already in the directory is only overwritten when the incoming sheet actually
 * has a value for it. That way a partial upload — say, handles and follower counts only —
 * enriches the directory rather than blanking everyone's city.
 */
export async function upsertCreators(
  records: CreatorRecord[],
  sourceFile: string,
): Promise<number> {
  // One transaction for the whole file. A chunk failing midway would otherwise leave the
  // directory holding part of an import, with no indication of where it stopped.
  return prisma.$transaction(
    async (tx) => {
      let written = 0;

      for (let start = 0; start < records.length; start += CHUNK) {
        const chunk = records.slice(start, start + CHUNK);

        const values = chunk.map(
          (record) => Prisma.sql`(
            ${crypto.randomUUID()},
            ${record.username},
            ${record.displayName},
            ${record.state},
            ${record.city},
            ${record.niches},
            ${record.followers},
            ${record.followers === null ? null : "sheet"},
            ${record.email},
            ${record.phone},
            ${record.rateCard},
            ${record.notes},
            ${sourceFile},
            NOW(),
            NOW()
          )`,
        );

        written += await tx.$executeRaw`
          INSERT INTO "Creator" (
            "id", "username", "displayName", "state", "city",
            "niches", "followers", "followersSource",
            "email", "phone", "rateCard", "notes", "sourceFile",
            "createdAt", "updatedAt"
          )
          VALUES ${Prisma.join(values)}
          ON CONFLICT ("username") DO UPDATE SET
            "displayName" = COALESCE(EXCLUDED."displayName", "Creator"."displayName"),
            "state"       = COALESCE(EXCLUDED."state",       "Creator"."state"),
            "city"        = COALESCE(EXCLUDED."city",        "Creator"."city"),
            -- An empty tag list means this sheet had no category column, so keep the old one.
            "niches"      = CASE
                              WHEN cardinality(EXCLUDED."niches") > 0 THEN EXCLUDED."niches"
                              ELSE "Creator"."niches"
                            END,
            -- A sheet rounds to "309k"; a live lookup does not. Once a creator has been
            -- checked against Instagram, a later upload must not walk that back.
            "followers"   = CASE
                              WHEN "Creator"."followersSource" = 'live' THEN "Creator"."followers"
                              ELSE COALESCE(EXCLUDED."followers", "Creator"."followers")
                            END,
            "followersSource" = CASE
                              WHEN "Creator"."followersSource" = 'live' THEN 'live'
                              WHEN EXCLUDED."followers" IS NOT NULL THEN 'sheet'
                              ELSE "Creator"."followersSource"
                            END,
            -- Contact details and the asking price follow the same rule as the rest: a
            -- sheet without the column leaves what we already knew alone, and a sheet with
            -- it is the newer answer.
            "email"       = COALESCE(EXCLUDED."email",       "Creator"."email"),
            "phone"       = COALESCE(EXCLUDED."phone",       "Creator"."phone"),
            "rateCard"    = COALESCE(EXCLUDED."rateCard",    "Creator"."rateCard"),
            "notes"       = COALESCE(EXCLUDED."notes",       "Creator"."notes"),
            "sourceFile"  = EXCLUDED."sourceFile",
            "updatedAt"   = NOW()
        `;
      }

      return written;
    },
    // Tens of thousands of rows take longer than the 5s default allows.
    { maxWait: 15_000, timeout: 180_000 },
  );
}
