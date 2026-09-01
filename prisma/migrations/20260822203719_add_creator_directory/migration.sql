-- CreateTable
CREATE TABLE "Creator" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "state" TEXT,
    "city" TEXT,
    "niche" TEXT,
    "followers" INTEGER,
    "notes" TEXT,
    "sourceFile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Creator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Creator_username_key" ON "Creator"("username");

-- CreateIndex
CREATE INDEX "Creator_state_idx" ON "Creator"("state");

-- CreateIndex
CREATE INDEX "Creator_city_idx" ON "Creator"("city");

-- CreateIndex
CREATE INDEX "Creator_niche_idx" ON "Creator"("niche");

-- CreateIndex
CREATE INDEX "Creator_followers_idx" ON "Creator"("followers");

-- CreateIndex
CREATE INDEX "Creator_state_city_niche_idx" ON "Creator"("state", "city", "niche");
