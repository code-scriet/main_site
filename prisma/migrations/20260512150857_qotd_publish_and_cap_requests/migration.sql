-- AlterTable
ALTER TABLE "problem_submission_counters" ADD COLUMN     "last_granted_at" TIMESTAMP(3),
ADD COLUMN     "last_granted_by" TEXT,
ADD COLUMN     "pending_request" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "request_note" TEXT,
ADD COLUMN     "requested_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "qotd" ADD COLUMN     "held_by" TEXT,
ADD COLUMN     "hold_reason" TEXT,
ADD COLUMN     "is_published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publish_at" TIMESTAMP(3),
ADD COLUMN     "published_at" TIMESTAMP(3);

-- Backfill: existing QOTDs were already live under the old date-only model.
-- Mark them all as published so /today and history continue to surface them.
UPDATE "qotd" SET "is_published" = true, "published_at" = "created_at";

-- CreateIndex
CREATE INDEX "problem_submission_counters_context_type_pending_request_idx" ON "problem_submission_counters"("context_type", "pending_request");

-- CreateIndex
CREATE INDEX "qotd_is_published_date_idx" ON "qotd"("is_published", "date");
