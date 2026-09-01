import { NextResponse } from "next/server";
import { z } from "zod";
import { cellsFromPastedText, detectLinks } from "@/lib/detect";
import { requireSession } from "@/lib/session";
import { setDetection } from "@/lib/store";
import { buildSummary } from "@/lib/summarise";

export const runtime = "nodejs";

const schema = z.object({
  // Generous cap: ~10k pasted URLs, but bounded so a huge body cannot exhaust memory.
  text: z.string().min(1, "Paste at least one URL.").max(500_000),
});

/** Direct URL input: one per line, comma or semicolon separated, or any mix. */
export async function POST(request: Request) {
  const auth = await requireSession();
  if (auth.response) return auth.response;

  let input;
  try {
    input = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Paste at least one URL." }, { status: 400 });
  }

  const detection = detectLinks(cellsFromPastedText(input.text));
  const summary = buildSummary({
    sourceLabel: "Pasted URLs",
    sheets: [],
    rowsScanned: 0,
    detection,
  });

  await setDetection(auth.session.sid, summary, detection.links);
  return NextResponse.json({ summary });
}
