import ExcelJS from "exceljs";
import { parseCsv } from "@/lib/csv";
import type { CellRef } from "@/lib/detect";

const CREATOR_HEADERS = [
  "creator",
  "influencer",
  "influencer name",
  "creator name",
  "talent",
  "handle",
  "username",
  "account",
  "profile name",
  "name",
];

const ALLOWED_EXTENSIONS = [".csv", ".tsv", ".txt", ".xlsx", ".xlsm"];

export type WorkbookScan = {
  sheets: string[];
  rowsScanned: number;
  cells: CellRef[];
};

export function validateUpload(
  filename: string,
  size: number,
  maxBytes: number,
): { ok: true } | { ok: false; reason: string } {
  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return { ok: false, reason: `Unsupported file type. Upload one of: ${ALLOWED_EXTENSIONS.join(", ")}` };
  }
  if (size <= 0) return { ok: false, reason: "File is empty." };
  if (size > maxBytes) {
    return { ok: false, reason: `File is larger than ${Math.round(maxBytes / (1024 * 1024))} MB.` };
  }
  return { ok: true };
}

/** Excel dates, formulas and hyperlinks all need flattening to plain text before scanning. */
function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") {
      const hyperlink = "hyperlink" in value ? String(value.hyperlink ?? "") : "";
      return hyperlink ? `${value.text} ${hyperlink}` : value.text;
    }
    if ("hyperlink" in value) return String(value.hyperlink ?? "");
    if ("result" in value) return String(value.result ?? "");
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
  }
  return "";
}

function creatorColumnIndex(headerRow: string[]): number {
  const normalized = headerRow.map((h) => h.toLowerCase().replace(/[_-]+/g, " ").trim());
  for (const candidate of CREATOR_HEADERS) {
    const index = normalized.indexOf(candidate);
    if (index !== -1) return index;
  }
  return -1;
}

/** A header row is one that labels columns rather than carrying data (i.e. no links in it). */
function looksLikeHeader(row: string[]): boolean {
  const nonEmpty = row.filter((cell) => cell.trim().length > 0);
  if (nonEmpty.length === 0) return false;
  return !nonEmpty.some((cell) => /https?:\/\/|www\.|\.com\//i.test(cell));
}

function scanRows(sheet: string, rows: string[][]): { cells: CellRef[]; rowsScanned: number } {
  const cells: CellRef[] = [];
  const headerRow = rows.length > 0 && looksLikeHeader(rows[0]) ? rows[0] : null;
  const creatorIndex = headerRow ? creatorColumnIndex(headerRow) : -1;
  const dataRows = headerRow ? rows.slice(1) : rows;

  dataRows.forEach((row, index) => {
    const rowNumber = index + (headerRow ? 2 : 1);
    const creatorHint =
      creatorIndex >= 0 && row[creatorIndex]?.trim() ? row[creatorIndex].trim() : null;
    for (const cell of row) {
      if (cell && cell.trim().length > 0) {
        cells.push({ sheet, row: rowNumber, text: cell, creatorHint, source: "file" });
      }
    }
  });

  return { cells, rowsScanned: dataRows.length };
}

export type SheetRows = { sheet: string; rows: string[][] };

/**
 * Reads a workbook or delimited file down to plain rows of text.
 *
 * Both link detection and the creator directory build on this, so file-format handling
 * lives in exactly one place.
 */
export async function readSheets(buffer: Buffer, filename: string): Promise<SheetRows[]> {
  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();

  if (extension === ".csv" || extension === ".tsv" || extension === ".txt") {
    return [{ sheet: "Sheet1", rows: parseCsv(buffer.toString("utf8")) }];
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheets: SheetRows[] = [];
  workbook.eachSheet((worksheet) => {
    const rows: string[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        values[colNumber - 1] = cellToText(cell.value);
      });
      rows.push(Array.from(values, (value) => value ?? ""));
    });
    sheets.push({ sheet: worksheet.name, rows });
  });

  return sheets;
}

/** Reads every sheet and every cell; nothing depends on a particular column layout. */
export async function scanWorkbook(buffer: Buffer, filename: string): Promise<WorkbookScan> {
  const sheets = await readSheets(buffer, filename);

  const cells: CellRef[] = [];
  let rowsScanned = 0;

  for (const { sheet, rows } of sheets) {
    const scanned = scanRows(sheet, rows);
    cells.push(...scanned.cells);
    rowsScanned += scanned.rowsScanned;
  }

  return { sheets: sheets.map((entry) => entry.sheet), rowsScanned, cells };
}
