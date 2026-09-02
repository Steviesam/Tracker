import { NextResponse } from "next/server";
import { z } from "zod";
import { fromDayInput } from "@/lib/campaigns/dates";
import { listCampaigns, people } from "@/lib/campaigns/queries";
import { CAMPAIGN_STATUSES, isCampaignStatus } from "@/lib/campaigns/status";
import { denyMoney, requireViewer } from "@/lib/campaigns/viewer";
import { firstIssue } from "@/lib/credentials";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireViewer();
  if (auth.response) return auth.response;

  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const search = params.get("search")?.trim();

  const campaigns = await listCampaigns(auth.viewer, {
    search: search || undefined,
    status: isCampaignStatus(status) ? status : undefined,
  });

  // The dropdowns need these on the same screen, and asking twice on every keystroke of the
  // search box would be a second round trip for a list that barely changes.
  return NextResponse.json({
    campaigns,
    people: await people(),
    canSeeMoney: auth.viewer.canSeeMoney,
  });
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the campaign a name.").max(120),
  brand: z.string().trim().min(1, "Which brand is this for?").max(120),
  startDate: day,
  endDate: day,
  brief: z.string().trim().max(5000).optional(),
  managerId: z.string().trim().optional(),
  // Whole rupees. Campaign money is quoted in round numbers, never in paise.
  budget: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
});

export async function POST(request: Request) {
  const auth = await requireViewer();
  if (auth.response) return auth.response;

  let input;
  try {
    input = createSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? firstIssue(error) : "Check the details you entered.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const startDate = fromDayInput(input.startDate);
  const endDate = fromDayInput(input.endDate);
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "Those dates are not valid." }, { status: 400 });
  }
  if (endDate < startDate) {
    return NextResponse.json({ error: "The end date is before the start date." }, { status: 400 });
  }
  if (input.budget != null && !auth.viewer.canSeeMoney) return denyMoney();

  const campaign = await prisma.campaign.create({
    data: {
      name: input.name,
      brand: input.brand,
      brief: input.brief || null,
      startDate,
      endDate,
      budget: input.budget ?? null,
      status: input.status ?? "PLANNING",
      // Whoever creates a campaign runs it unless they say otherwise, which is true often
      // enough to be worth not asking.
      managerId: input.managerId || auth.session.uid,
    },
    select: { id: true },
  });

  return NextResponse.json({ id: campaign.id });
}
