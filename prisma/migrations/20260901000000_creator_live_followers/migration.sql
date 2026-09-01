-- Track where a creator's follower count came from, so a live lookup is not overwritten
-- by the next sheet upload.
ALTER TABLE "Creator" ADD COLUMN "followersSource" TEXT;
ALTER TABLE "Creator" ADD COLUMN "followersCheckedAt" TIMESTAMP(3);

-- Every count already in the directory arrived by upload.
UPDATE "Creator" SET "followersSource" = 'sheet' WHERE "followers" IS NOT NULL;
