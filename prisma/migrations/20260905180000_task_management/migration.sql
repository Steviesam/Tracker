-- Task management: tasks that need not belong to a campaign, carry a priority and a
-- timer, and can say why they ran long. Plus a record of who was here on which day.

-- A task can now stand on its own. Every existing row has a campaign, so nothing is
-- orphaned by this; it only stops being required from here on.
ALTER TABLE "Task" ALTER COLUMN "campaignId" DROP NOT NULL;

ALTER TABLE "Task" ADD COLUMN "description" TEXT;
ALTER TABLE "Task" ADD COLUMN "brand" TEXT;
ALTER TABLE "Task" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "Task" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Task" ADD COLUMN "dueHasTime" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "reminderMinutes" INTEGER;
ALTER TABLE "Task" ADD COLUMN "remindedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "note" TEXT;

-- Existing tasks were created by the campaign automation or typed into a campaign; either
-- way nobody recorded who, and inventing an author would be worse than leaving it null.
ALTER TABLE "Task"
  ADD CONSTRAINT "Task_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The floor view reads every unfinished task in priority then deadline order.
CREATE INDEX "Task_completedAt_priority_dueDate_idx"
  ON "Task"("completedAt", "priority", "dueDate");

CREATE TABLE "WorkDay" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "signedInAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "signedOutAt" TIMESTAMP(3),

  CONSTRAINT "WorkDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkDay_userId_day_key" ON "WorkDay"("userId", "day");
CREATE INDEX "WorkDay_day_idx" ON "WorkDay"("day");

ALTER TABLE "WorkDay"
  ADD CONSTRAINT "WorkDay_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
