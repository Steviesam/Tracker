-- Categories become tags rather than one string per creator.
--
-- Sheets write them run-on -- `Fashion/lifestyle/ugc` -- so a single column made each
-- spelling its own filter option: 146 categories for 4,325 creators, where choosing
-- "Lifestyle" found only the 116 typed that exact way.

-- AlterTable
ALTER TABLE "Creator" ADD COLUMN "niches" TEXT[];

-- Carry the existing values over rather than dropping them: split on the separators, throw
-- away a parenthetical city like "City Page (pune)", and title-case what is left.
--
-- This is a plain split, so it cannot merge spellings that differ by more than case
-- ("Citypage" stays apart from "City Page", "Comedian" from "Comedy"). Re-uploading the
-- sheet runs the full mapping in src/lib/directory/niches.ts and collapses those too.
UPDATE "Creator"
SET "niches" = source.tags
FROM (
  SELECT
    c."id",
    array_agg(DISTINCT initcap(btrim(part))) AS tags
  FROM "Creator" c,
    unnest(
      regexp_split_to_array(regexp_replace(c."niche", '\([^)]*\)', ' ', 'g'), '[/,|+&;]')
    ) AS part
  WHERE c."niche" IS NOT NULL
    AND btrim(part) <> ''
  GROUP BY c."id"
) AS source
WHERE "Creator"."id" = source."id";

-- DropIndex
-- Both of these cover the old column, so they go before it does.
DROP INDEX IF EXISTS "Creator_niche_idx";

-- DropIndex
DROP INDEX IF EXISTS "Creator_state_city_niche_idx";

-- AlterTable
ALTER TABLE "Creator" DROP COLUMN "niche";

-- CreateIndex
CREATE INDEX "Creator_state_city_idx" ON "Creator"("state", "city");

-- CreateIndex
-- Array containment needs GIN; a b-tree cannot answer "has this tag".
CREATE INDEX "Creator_niches_idx" ON "Creator" USING GIN ("niches");
