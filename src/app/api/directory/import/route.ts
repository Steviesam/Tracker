import { NextResponse } from "next/server";
import { readCreators, upsertCreators } from "@/lib/directory/import";
import type { ImportSummary } from "@/lib/directory/types";
import { maxUploadBytes } from "@/lib/env";
import { validateUpload } from "@/lib/parse";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Imports a creator sheet into the shared directory.
 *
 * The directory is shared across users on purpose: it is one dataset the team maintains,
 * and a per-user copy would mean re-uploading the same 10,000 rows for every account.
 */
export async function POST(request: Request) {
  const auth = await requireSession();
  if (auth.response) return auth.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }

  const check = validateUpload(file.name, file.size, maxUploadBytes());
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

  let parsed;
  try {
    parsed = await readCreators(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Could not read this file: ${message}` }, { status: 400 });
  }

  if (parsed.records.length === 0) {
    return NextResponse.json(
      {
        error:
          "No creators found. The sheet needs a header row with a username column — " +
          "'Instagram Handle', 'Username' or 'Profile URL' all work.",
      },
      { status: 400 },
    );
  }

  try {
    await upsertCreators(parsed.records, file.name);
  } catch (error) {
    // The upsert runs in one transaction, so nothing was written and a retry is safe.
    console.error("Directory import failed", error);
    return NextResponse.json(
      { error: "Could not save the creators. Nothing was imported, so it is safe to retry." },
      { status: 500 },
    );
  }

  const summary: ImportSummary = { ...parsed.summary, imported: parsed.records.length };
  return NextResponse.json({ summary });
}
