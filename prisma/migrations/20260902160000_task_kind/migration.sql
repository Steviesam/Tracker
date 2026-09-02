-- Marks the tasks that are about money, so they can be kept from members.
ALTER TABLE "Task" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'GENERAL';

-- Tasks created before this column existed can only be recognised by their generated name.
-- This runs once, against rows the automation wrote, so the match is safe here even though
-- it would not be safe as a permanent rule.
UPDATE "Task" SET "kind" = 'PAYMENT' WHERE "name" LIKE 'Release payment%';

-- Members are served a list with the payment tasks removed, which is a filter on every read.
CREATE INDEX "Task_kind_idx" ON "Task"("kind");
