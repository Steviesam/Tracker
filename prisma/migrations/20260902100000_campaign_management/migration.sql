-- Campaign management: a campaign, the creators on it, the work it generates, and a record
-- of what happened. No stored "overdue" or "progress" anywhere — both are facts about
-- today, and a stored copy would be wrong every morning until something rewrote it.

CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "brief" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "budget" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "managerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");
CREATE INDEX "Campaign_endDate_idx" ON "Campaign"("endDate");

CREATE TABLE "CampaignInfluencer" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT,
    "creatorId" TEXT,
    "followers" INTEGER,
    "engagementRate" DOUBLE PRECISION,
    "statsCheckedAt" TIMESTAMP(3),
    "agreedRate" INTEGER,
    "assignedToId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SELECTED',
    "deadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignInfluencer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignInfluencer_campaignId_platform_handle_key"
    ON "CampaignInfluencer"("campaignId", "platform", "handle");
CREATE INDEX "CampaignInfluencer_campaignId_status_idx" ON "CampaignInfluencer"("campaignId", "status");
CREATE INDEX "CampaignInfluencer_assignedToId_idx" ON "CampaignInfluencer"("assignedToId");

CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "influencerId" TEXT,
    "name" TEXT NOT NULL,
    "assignedToId" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Task_campaignId_completedAt_idx" ON "Task"("campaignId", "completedAt");
CREATE INDEX "Task_assignedToId_completedAt_idx" ON "Task"("assignedToId", "completedAt");
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");

CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "actorId" TEXT,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Activity_campaignId_createdAt_idx" ON "Activity"("campaignId", "createdAt");

-- Deleting a campaign takes its creators, tasks and history with it; losing the person who
-- owned something must not take the work itself, so those only go null.
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_managerId_fkey"
    FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CampaignInfluencer" ADD CONSTRAINT "CampaignInfluencer_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignInfluencer" ADD CONSTRAINT "CampaignInfluencer_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Task" ADD CONSTRAINT "Task_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_influencerId_fkey"
    FOREIGN KEY ("influencerId") REFERENCES "CampaignInfluencer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Activity" ADD CONSTRAINT "Activity_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
