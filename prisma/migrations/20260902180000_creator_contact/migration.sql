-- Contact details and an asking price for directory creators.
--
-- All nullable with no default: a sheet that never had these columns leaves them empty,
-- and the import's COALESCE rules then keep whatever a later, richer sheet supplies.
ALTER TABLE "Creator" ADD COLUMN "email" TEXT;
ALTER TABLE "Creator" ADD COLUMN "phone" TEXT;
ALTER TABLE "Creator" ADD COLUMN "rateCard" INTEGER;
