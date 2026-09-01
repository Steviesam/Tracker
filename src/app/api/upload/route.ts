import { NextResponse } from "next/server";
import { detectLinks } from "@/lib/detect";
import { maxUploadBytes } from "@/lib/env";
import { scanWorkbook, validateUpload } from "@/lib/parse";
import { requireSession } from "@/lib/session";
import { setDetection } from "@/lib/store";
import { buildSummary } from "@/lib/summarise";

export const runtime = "nodejs";

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

  let scan;
  try {
    scan = await scanWorkbook(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Could not read this file: ${message}` }, { status: 400 });
  }

  const detection = detectLinks(scan.cells);
  const summary = buildSummary({
    sourceLabel: file.name,
    sheets: scan.sheets,
    rowsScanned: scan.rowsScanned,
    detection,
  });

  await setDetection(auth.session.sid, summary, detection.links);
  return NextResponse.json({ summary });
}
