-- What has actually been paid to each creator.
--
-- A running total rather than a paid/unpaid flag: half up front and half on delivery is the
-- normal arrangement, and a flag cannot say which half is still owed. Whether someone is
-- unpaid, part paid or settled is worked out from this against the agreed rate, so the two
-- can never drift apart.

ALTER TABLE "CampaignInfluencer" ADD COLUMN "amountPaid" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CampaignInfluencer" ADD COLUMN "paidAt" TIMESTAMP(3);

-- Finding who is still owed money is the query this table exists to answer.
CREATE INDEX "CampaignInfluencer_campaignId_paidAt_idx" ON "CampaignInfluencer"("campaignId", "paidAt");
