/**
 * Reading campaigns.
 *
 * Everything the screens show that is not stored — overdue, due today, progress — is worked
 * out here, once, from the rows. Nothing computes it a second time in a component, so the
 * number in the list and the number in the workspace cannot drift apart.
 */

import { prisma } from "@/lib/db";
import { isDueToday, isPastDue } from "@/lib/campaigns/dates";
import { money, paymentState } from "@/lib/campaigns/payments";
import { countInfluencers, countTasks, progressOf } from "@/lib/campaigns/progress";
import {
  toCampaignStatus,
  toInfluencerStatus,
  type CampaignPlatform,
  type CampaignStatus,
} from "@/lib/campaigns/status";
import type {
  ActivityView,
  CampaignDetail,
  CampaignInfluencerView,
  CampaignSummary,
  MyWork,
  Person,
  TaskView,
} from "@/lib/campaigns/types";

/** Newest activity first, and enough of it to answer "what happened lately". */
const ACTIVITY_LIMIT = 60;

type PersonRow = { id: string; name: string; email: string } | null;

function toPerson(row: PersonRow): Person | null {
  return row ? { id: row.id, name: row.name, email: row.email } : null;
}

function taskState(
  task: { dueDate: Date | null; completedAt: Date | null },
  now: Date,
): TaskView["state"] {
  if (task.completedAt) return "COMPLETED";
  return isPastDue(task.dueDate, now) ? "OVERDUE" : "PENDING";
}

type TaskRow = {
  id: string;
  name: string;
  dueDate: Date | null;
  completedAt: Date | null;
  assignedTo: PersonRow;
  influencer: { id: string; handle: string } | null;
};

function toTaskView(task: TaskRow, now: Date): TaskView {
  return {
    id: task.id,
    name: task.name,
    assignedTo: toPerson(task.assignedTo),
    dueDate: task.dueDate?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    state: taskState(task, now),
    influencer: task.influencer,
  };
}

export async function listCampaigns(
  filters: { search?: string; status?: CampaignStatus } = {},
): Promise<CampaignSummary[]> {
  const now = new Date();

  const campaigns = await prisma.campaign.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      // Name and brand are the two things anyone remembers a campaign by.
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" as const } },
              { brand: { contains: filters.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { endDate: "asc" }],
    select: {
      id: true,
      name: true,
      brand: true,
      status: true,
      startDate: true,
      endDate: true,
      budget: true,
      manager: { select: { id: true, name: true, email: true } },
      influencers: {
        select: { status: true, deadline: true, agreedRate: true, amountPaid: true },
      },
      tasks: { select: { dueDate: true, completedAt: true } },
    },
  });

  return campaigns.map((campaign) => {
    const influencers = countInfluencers(campaign.influencers, now);
    const tasks = countTasks(campaign.tasks, now);
    return {
      id: campaign.id,
      name: campaign.name,
      brand: campaign.brand,
      status: toCampaignStatus(campaign.status),
      startDate: campaign.startDate.toISOString(),
      endDate: campaign.endDate.toISOString(),
      manager: toPerson(campaign.manager),
      influencers,
      tasks,
      progress: progressOf(influencers, tasks),
      money: money(campaign.influencers, campaign.budget),
    };
  });
}

export async function findCampaign(id: string): Promise<CampaignDetail | null> {
  const now = new Date();

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      brand: true,
      brief: true,
      startDate: true,
      endDate: true,
      budget: true,
      status: true,
      manager: { select: { id: true, name: true, email: true } },
      influencers: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          platform: true,
          handle: true,
          displayName: true,
          followers: true,
          engagementRate: true,
          statsCheckedAt: true,
          agreedRate: true,
          amountPaid: true,
          status: true,
          deadline: true,
          assignedTo: { select: { id: true, name: true, email: true } },
        },
      },
      tasks: {
        orderBy: [{ completedAt: "asc" }, { dueDate: "asc" }],
        select: {
          id: true,
          name: true,
          dueDate: true,
          completedAt: true,
          assignedTo: { select: { id: true, name: true, email: true } },
          influencer: { select: { id: true, handle: true } },
        },
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: ACTIVITY_LIMIT,
        select: {
          id: true,
          kind: true,
          message: true,
          createdAt: true,
          actor: { select: { name: true } },
        },
      },
    },
  });

  if (!campaign) return null;

  const influencers: CampaignInfluencerView[] = campaign.influencers.map((row) => {
    const status = toInfluencerStatus(row.status);
    return {
      id: row.id,
      platform: row.platform as CampaignPlatform,
      handle: row.handle,
      displayName: row.displayName,
      followers: row.followers,
      engagementRate: row.engagementRate,
      statsCheckedAt: row.statsCheckedAt?.toISOString() ?? null,
      agreedRate: row.agreedRate,
      amountPaid: row.amountPaid,
      payment: paymentState(row),
      assignedTo: toPerson(row.assignedTo),
      status,
      deadline: row.deadline?.toISOString() ?? null,
      overdue: status !== "COMPLETED" && isPastDue(row.deadline, now),
    };
  });

  const tasks = campaign.tasks.map((task) => toTaskView(task, now));

  const activity: ActivityView[] = campaign.activities.map((row) => ({
    id: row.id,
    kind: row.kind,
    message: row.message,
    actor: row.actor?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  }));

  const counts = {
    influencers: countInfluencers(campaign.influencers, now),
    tasks: countTasks(campaign.tasks, now),
  };

  return {
    id: campaign.id,
    name: campaign.name,
    brand: campaign.brand,
    brief: campaign.brief,
    startDate: campaign.startDate.toISOString(),
    endDate: campaign.endDate.toISOString(),
    budget: campaign.budget,
    status: toCampaignStatus(campaign.status),
    manager: toPerson(campaign.manager),
    influencers,
    tasks,
    activity,
    counts,
    progress: progressOf(counts.influencers, counts.tasks),
    money: money(campaign.influencers, campaign.budget),
  };
}

/**
 * What this person owes today.
 *
 * Only unfinished tasks are fetched, and the split into "today" and "late" happens here
 * rather than in two queries, because both need the same Indian day boundary and running
 * them separately could straddle midnight.
 */
export async function myWork(userId: string): Promise<MyWork> {
  const now = new Date();

  const tasks = await prisma.task.findMany({
    where: { assignedToId: userId, completedAt: null },
    orderBy: { dueDate: "asc" },
    select: {
      id: true,
      name: true,
      dueDate: true,
      completedAt: true,
      assignedTo: { select: { id: true, name: true, email: true } },
      influencer: { select: { id: true, handle: true } },
      campaign: { select: { id: true, name: true } },
    },
  });

  const activeCampaigns = await prisma.campaign.count({ where: { status: "ACTIVE" } });

  const dueToday: MyWork["dueToday"] = [];
  const overdue: MyWork["overdue"] = [];

  for (const task of tasks) {
    const view = { ...toTaskView(task, now), campaign: task.campaign };
    if (isPastDue(task.dueDate, now)) overdue.push(view);
    else if (isDueToday(task.dueDate, now)) dueToday.push(view);
  }

  return { dueToday, overdue, activeCampaigns };
}

/** Everyone with an account, for the assignee dropdowns. */
export async function people(): Promise<Person[]> {
  return prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
}
