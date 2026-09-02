-- Closes signup behind an owner-managed invite list, and moves rate limiting off
-- per-instance memory so it survives a serverless deployment.

ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'MEMBER';

-- The deployment already has accounts, and someone has to be able to invite. The earliest
-- account is the one that set the deployment up, so it becomes the owner. On an empty
-- database this matches nothing and the first signup claims ownership instead.
UPDATE "User"
SET "role" = 'OWNER'
WHERE "id" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1);

CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "invitedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invite_email_key" ON "Invite"("email");
CREATE INDEX "Invite_email_idx" ON "Invite"("email");

ALTER TABLE "Invite" ADD CONSTRAINT "Invite_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing accounts predate the invite list. Recording them as already accepted keeps the
-- owner's list a true picture of who has access, rather than showing only later arrivals.
INSERT INTO "Invite" ("id", "email", "acceptedAt", "createdAt")
SELECT md5(random()::text || "email"), "email", "createdAt", "createdAt" FROM "User";

CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RateLimit_resetAt_idx" ON "RateLimit"("resetAt");
