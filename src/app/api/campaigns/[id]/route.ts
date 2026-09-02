import { NextResponse } from "next/server";
import { z } from "zod";
import { record } from "@/lib/campaigns/activity";
import { fromDayInput } from "@/lib/campaigns/dates";
import { findCampaign } from "@/lib/campaigns/queries";
import { CAMPAIGN_STATUS_LABEL, CAMPAIGN_STATUSES } from "@/lib/campaigns/status";
import { firstIssue } from "@/lib/credentials";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const auth = await requireSession();
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const campaign = await findCampaign(id);
  if (!campaign) return NextResponse.json({ error: "No such campaign." }, { status: 404 });

  return NextResponse.json({ campaign });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  brand: z.string().trim().min(1).max(120).optional(),
  brief: z.string().trim().max(5000).nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  budget: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  managerId: z.string().nullable().optional(),
});

export async function PATCH(request: Request, context: Context) {
  const auth = await requireSession();
  if (auth.response) return auth.response;

  const { id } = await context.params;

  let input;
  try {
    input = patchSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? firstIssue(error) : "Check the details you entered.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const existing = await prisma.campaign.findUnique({
    where: { id },
    select: { status: true, startDate: true, endDate: true },
  });
  if (!existing) return NextResponse.json({ error: "No such campaign." }, { status: 404 });

  // A campaign always has both dates, so these are either a new value or "leave it alone" —
  // never null, which is what the update below relies on.
  const startDate = input.startDate ? fromDayInput(input.startDate) ?? undefined : undefined;
  const endDate = input.endDate ? fromDayInput(input.endDate) ?? undefined : undefined;
  if ((input.startDate && !startDate) || (input.endDate && !endDate)) {
    return NextResponse.json({ error: "Those dates are not valid." }, { status: 400 });
  }

  const from = startDate ?? existing.startDate;
  const to = endDate ?? existing.endDate;
  if (to < from) {
    return NextResponse.json({ error: "The end date is before the start date." }, { status: 400 });
  }

  await prisma.campaign.update({
    where: { id },
    data: {
      name: input.name,
      brand: input.brand,
      brief: input.brief === undefined ? undefined : input.brief || null,
      startDate,
      endDate,
      budget: input.budget === undefined ? undefined : input.budget,
      status: input.status,
      managerId: input.managerId === undefined ? undefined : input.managerId || null,
    },
  });

  // Only the campaign's own status earns a line. Fixing a typo in the brief is not history.
  if (input.status && input.status !== existing.status) {
    await record(
      prisma,
      id,
      auth.session.uid,
      "campaign_updated",
      `${auth.session.name} moved the campaign to ${CAMPAIGN_STATUS_LABEL[input.status]}`,
    );
  }

  return NextResponse.json({ campaign: await findCampaign(id) });
}

export async function DELETE(_request: Request, context: Context) {
  const auth = await requireSession();
  if (auth.response) return auth.response;

  const { id } = await context.params;
  // Influencers, tasks and history go with it — see the cascades in the migration.
  await prisma.campaign.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
