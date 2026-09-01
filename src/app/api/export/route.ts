import { NextResponse } from "next/server";
import { buildCsv, buildXlsx } from "@/lib/export";
import { requireSession } from "@/lib/session";
import { getSession } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireSession();
  if (auth.response) return auth.response;

  const data = await getSession(auth.session.sid);
  if (!data || data.results.length === 0) {
    return NextResponse.json({ error: "Nothing to export yet." }, { status: 400 });
  }

  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `social-metrics-${stamp}.${format}`;

  if (format === "csv") {
    return new NextResponse(buildCsv(data.results, data.creatorStats), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const buffer = await buildXlsx(data.results, data.creatorStats);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
