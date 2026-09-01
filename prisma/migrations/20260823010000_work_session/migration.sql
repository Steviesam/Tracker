-- CreateTable
-- One login's Metrics and Engagement work. Held in Postgres so a Vercel deploy, whose
-- functions do not share process memory, can still restore results after a refresh.
CREATE TABLE "WorkSession" (
    "sid" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSession_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE INDEX "WorkSession_updatedAt_idx" ON "WorkSession"("updatedAt");
