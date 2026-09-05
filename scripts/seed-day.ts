/**
 * A believable working day, for looking at the screens.
 *
 * Four accounts and a day of work with the shapes that break layouts — a long name, a
 * running timer, something late with a reason on it. Local only; it refuses to run against
 * anything but a database on this machine, since it writes fake people.
 */

import { hash } from "bcryptjs";
import { prisma } from "../src/lib/db";
import { istDay } from "../src/lib/campaigns/dates";

const PASSWORD = "TrackerLocal123!";

async function person(email: string, name: string, role: string) {
  const passwordHash = await hash(PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, role, passwordHash },
    update: { name, role },
  });
  await prisma.invite.upsert({
    where: { email },
    create: { email, acceptedAt: new Date() },
    update: { acceptedAt: new Date() },
  });
  return user;
}

function at(hours: number, minutes: number, dayOffset = 0): Date {
  const day = new Date(Date.now() + dayOffset * 24 * 60 * 60 * 1000);
  return new Date(`${istDay(day)}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+05:30`);
}

function refuseRemoteDatabases() {
  const url = process.env.DATABASE_URL ?? "";
  const host = url.match(/@([^:/?]+)/)?.[1] ?? "";
  if (host === "localhost" || host === "127.0.0.1" || host === "postgres") return;
  console.error(`Refusing to seed fake accounts into ${host || "an unknown host"}.`);
  process.exit(1);
}

async function main() {
  refuseRemoteDatabases();
  const owner = await person("owner@agency.test", "Priya Nair", "OWNER");
  const manager = await person("ops@agency.test", "Arjun Mehta", "MANAGER");
  const rahul = await person("rahul@agency.test", "Rahul Verma", "MEMBER");
  const sana = await person("sana@agency.test", "Sana Qureshi", "MEMBER");

  const campaign = await prisma.campaign.upsert({
    where: { id: "seed-campaign" },
    create: {
      id: "seed-campaign",
      name: "Monsoon launch",
      brand: "Brand X",
      startDate: at(9, 0, -6),
      endDate: at(18, 0, 20),
      status: "ACTIVE",
      budget: 800000,
      managerId: manager.id,
    },
    update: {},
  });

  await prisma.task.deleteMany({ where: { name: { startsWith: "[seed]" } } });

  const tasks = [
    {
      name: "[seed] Shortlist 20 influencers for Brand X",
      description: "Lifestyle creators in Patna and Ranchi, 50k–300k followers. Check last-10 reel views before adding.",
      priority: "HIGH",
      assignedToId: rahul.id,
      campaignId: campaign.id,
      dueDate: at(11, 0),
      dueHasTime: true,
      reminderMinutes: 30,
      startedAt: at(10, 5),
    },
    {
      name: "[seed] Send the brief to confirmed creators",
      priority: "HIGH",
      assignedToId: rahul.id,
      campaignId: campaign.id,
      dueDate: at(17, 0, -1),
      dueHasTime: true,
      reminderMinutes: 60,
      remindedAt: at(16, 0, -1),
      note: "Influencer data was missing from the database, had to verify by hand.",
    },
    {
      name: "[seed] Chase pending invoices",
      brand: "Zeal Cosmetics",
      priority: "MEDIUM",
      assignedToId: rahul.id,
      dueDate: at(0, 0),
      dueHasTime: false,
      reminderMinutes: 180,
    },
    {
      name: "[seed] Collect analytics from published reels",
      priority: "LOW",
      assignedToId: rahul.id,
      campaignId: campaign.id,
      dueDate: at(0, 0, 3),
      dueHasTime: false,
    },
    {
      name: "[seed] Draft the weekly report",
      priority: "MEDIUM",
      assignedToId: rahul.id,
      brand: "Brand X",
      dueDate: at(15, 0),
      dueHasTime: true,
      startedAt: at(9, 10),
      completedAt: at(10, 25),
    },
    {
      name: "[seed] Negotiate rates with three creators",
      priority: "HIGH",
      assignedToId: sana.id,
      campaignId: campaign.id,
      dueDate: at(14, 30),
      dueHasTime: true,
      reminderMinutes: 30,
    },
    {
      name: "[seed] Update the creator directory from yesterday's sheet",
      priority: "LOW",
      assignedToId: sana.id,
      dueDate: at(0, 0, -2),
      dueHasTime: false,
      note: "Blocked: waiting on the finance team for the rate card.",
    },
    {
      name: "[seed] Approve content from @arya.styles",
      priority: "MEDIUM",
      assignedToId: sana.id,
      campaignId: campaign.id,
      dueDate: at(12, 0),
      dueHasTime: true,
      startedAt: at(11, 30),
      completedAt: at(11, 52),
    },
    {
      name: "[seed] Review the campaign budget",
      priority: "MEDIUM",
      assignedToId: manager.id,
      campaignId: campaign.id,
      dueDate: at(16, 0),
      dueHasTime: true,
    },
  ];

  for (const task of tasks) {
    await prisma.task.create({ data: { ...task, createdById: manager.id } });
  }

  const today = istDay();
  for (const [user, inAt, outAt] of [
    [rahul, at(9, 2), null],
    [sana, at(9, 47), null],
    [manager, at(8, 55), null],
    [owner, at(10, 15), null],
  ] as const) {
    await prisma.workDay.upsert({
      where: { userId_day: { userId: user.id, day: today } },
      create: { userId: user.id, day: today, signedInAt: inAt, lastSeenAt: new Date() },
      update: { signedInAt: inAt, lastSeenAt: new Date(), signedOutAt: outAt },
    });
  }

  console.log(`Seeded. Password for every account: ${PASSWORD}`);
  console.log("owner@agency.test (owner) · ops@agency.test (manager) · rahul@agency.test · sana@agency.test");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
