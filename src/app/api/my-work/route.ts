import { NextResponse } from "next/server";
import { myWork } from "@/lib/campaigns/queries";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What is on the signed-in person today. Always their own — there is no user parameter. */
export async function GET() {
  const auth = await requireSession();
  if (auth.response) return auth.response;

  return NextResponse.json(await myWork(auth.session.uid));
}
