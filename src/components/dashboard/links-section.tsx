"use client";

import { useRef, useState } from "react";
import KpiStrip from "@/components/dashboard/kpi-strip";
import {
  IconArrow,
  IconDownload,
  IconLink,
  IconRefresh,
  IconUpload,
} from "@/components/icons";
import ResultsTable from "@/components/results-table";
import { formatDateTime } from "@/lib/format";
import { PLATFORMS, PLATFORM_LABEL, type DetectionSummary, type LinkResult } from "@/lib/types";

export type BusyKind = "upload" | "paste" | "process" | "refresh" | "creators" | null;

type Props = {
  summary: DetectionSummary | null;
  results: LinkResult[];
  lastRefreshedAt: string | null;
  busy: BusyKind;
  onUpload: (file: File) => void;
  onPaste: (text: string) => void;
  onFetch: (kind: "process" | "refresh") => void;
};

const ACCEPTED = ".csv,.tsv,.txt,.xlsx,.xlsm";

export default function LinksSection({
  summary,
  results,
  lastRefreshedAt,
  busy,
  onUpload,
  onPaste,
  onFetch,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState("");
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const disabled = busy !== null;
  const pastedCount = pasted
    .split(/[\n\r,;]+/)
    .map((part) => part.trim())
    .filter(Boolean).length;

  function accept(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    onUpload(file);
  }

  const untouched = summary === null && results.length === 0;

  return (
    <div className="space-y-5">
      {results.length > 0 ? <KpiStrip results={results} /> : null}

      {untouched ? (
        <section className="animate-fade relative overflow-hidden rounded-xl bg-slate-950 px-6 py-8 text-white sm:px-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-indigo-600/25 blur-3xl"
          />
          <div className="relative max-w-xl">
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Start with a file, or a handful of links.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Nothing is fetched until you ask for it. Detection runs first and shows you what it
              found, so you can check the list before spending a single provider call.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {PLATFORMS.map((platform) => (
                <span
                  key={platform}
                  className="chip bg-white/10 text-slate-200 ring-white/10"
                >
                  {PLATFORM_LABEL[platform]}
                </span>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <div className="flex items-center gap-2">
            <IconUpload className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold">Upload a spreadsheet</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Every sheet and cell is scanned, so links can sit in any column. A creator column is
            optional.
          </p>

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={disabled}
            onDragOver={(event) => {
              event.preventDefault();
              if (!disabled) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!disabled) accept(event.dataTransfer.files?.[0]);
            }}
            className={`mt-4 flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-7 text-center transition-all duration-150 disabled:opacity-50 ${
              dragging
                ? "border-indigo-400 bg-indigo-50/70"
                : "border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <IconUpload className={`h-6 w-6 ${dragging ? "text-indigo-500" : "text-slate-400"}`} />
            <span className="text-sm font-medium text-slate-700">
              {busy === "upload"
                ? "Scanning…"
                : dragging
                  ? "Drop to scan"
                  : "Drop a file, or click to browse"}
            </span>
            <span className="text-xs text-slate-500">
              {fileName && busy !== "upload" ? fileName : "CSV, TSV, TXT, XLSX, XLSM"}
            </span>
          </button>

          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={(event) => accept(event.target.files?.[0])}
            disabled={disabled}
          />
        </section>

        <section className="card flex flex-col p-5">
          <div className="flex items-center gap-2">
            <IconLink className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold">Or paste links</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            One per line, comma separated, or pasted straight out of a message.
          </p>

          <textarea
            className="field mt-4 min-h-[132px] flex-1 resize-y font-mono text-xs leading-relaxed"
            placeholder={
              "https://www.instagram.com/reel/ABC123/\nhttps://youtu.be/dQw4w9WgXcQ\nhttps://www.facebook.com/reel/123456789"
            }
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            disabled={disabled}
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              {pastedCount > 0
                ? `${pastedCount} line${pastedCount === 1 ? "" : "s"} to scan`
                : "Nothing pasted yet"}
            </span>
            <button
              className="btn-primary"
              disabled={disabled || pastedCount === 0}
              onClick={() => onPaste(pasted)}
            >
              {busy === "paste" ? "Detecting…" : "Detect links"}
              <IconArrow className="h-4 w-4" />
            </button>
          </div>
        </section>
      </div>

      {summary ? (
        <section className="card animate-fade p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <div>
                <p className="label">Detected</p>
                <p className="text-2xl font-semibold tracking-tight tabular-nums">
                  {summary.uniqueLinks}
                  <span className="ml-1.5 text-sm font-normal text-slate-500">links</span>
                </p>
              </div>

              <div className="hidden h-9 w-px bg-slate-200 sm:block" />

              <div className="flex flex-wrap gap-1.5">
                {PLATFORMS.filter((platform) => summary.byPlatform[platform] > 0).map((platform) => (
                  <span
                    key={platform}
                    className="chip bg-slate-50 text-slate-700 ring-slate-200"
                  >
                    {PLATFORM_LABEL[platform]}
                    <strong className="tabular-nums">{summary.byPlatform[platform]}</strong>
                  </span>
                ))}
              </div>
            </div>

            {results.length === 0 ? (
              <button
                className="btn-primary"
                onClick={() => onFetch("process")}
                disabled={disabled || summary.uniqueLinks === 0}
              >
                {busy === "process" ? "Fetching metrics…" : "Fetch metrics"}
                <IconArrow className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
            {summary.sourceLabel}
            {summary.sheets.length > 0
              ? ` · ${summary.rowsScanned} rows · ${summary.sheets.length} sheet${summary.sheets.length === 1 ? "" : "s"}`
              : ""}{" "}
            · {summary.totalUrlsFound} URLs found · {summary.duplicatesRemoved} duplicates removed ·{" "}
            {summary.unsupportedSkipped} unsupported skipped
          </p>
        </section>
      ) : null}

      {busy === "process" && results.length === 0 ? <TableSkeleton /> : null}

      {results.length > 0 ? (
        <section className="animate-fade space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              Last updated <span className="text-slate-700">{formatDateTime(lastRefreshedAt)}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-secondary"
                onClick={() => onFetch("refresh")}
                disabled={disabled}
              >
                <IconRefresh className={`h-4 w-4 ${busy === "refresh" ? "animate-spin" : ""}`} />
                {busy === "refresh" ? "Refreshing…" : "Refresh all"}
              </button>
              <a className="btn-secondary" href="/api/export?format=csv">
                <IconDownload className="h-4 w-4" />
                CSV
              </a>
              <a className="btn-primary" href="/api/export?format=xlsx">
                <IconDownload className="h-4 w-4" />
                Excel
              </a>
            </div>
          </div>

          <ResultsTable results={results} />
        </section>
      ) : null}
    </div>
  );
}

/** Shown while the first fetch runs, so the page does not sit empty for several seconds. */
function TableSkeleton() {
  return (
    <div className="card space-y-3 p-5" aria-hidden="true">
      <div className="skeleton h-4 w-40" />
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex gap-3">
          <div className="skeleton h-4 w-20" />
          <div className="skeleton h-4 flex-1" />
          <div className="skeleton h-4 w-16" />
          <div className="skeleton h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
