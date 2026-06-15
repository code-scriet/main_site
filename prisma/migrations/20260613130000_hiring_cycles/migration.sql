-- hiring_cycles (audit A11): one application per email PER hiring season.
--
-- Data-preserving: the email unique was a unique INDEX (hiring_applications_email_key),
-- not a table constraint — DROP INDEX, not DROP CONSTRAINT. New `cycle` column adds
-- with a NOT NULL DEFAULT so every existing row backfills to '2026' atomically; the
-- old global-email uniqueness then becomes per-(email, cycle). No existing row can
-- violate the new composite unique because email was globally unique before.

-- DropIndex
DROP INDEX "hiring_applications_email_key";

-- AlterTable
ALTER TABLE "hiring_applications" ADD COLUMN     "cycle" TEXT NOT NULL DEFAULT '2026';

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "hiring_cycle" TEXT NOT NULL DEFAULT '2026';

-- CreateIndex
CREATE INDEX "hiring_applications_cycle_created_at_idx" ON "hiring_applications"("cycle", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "hiring_applications_email_cycle_key" ON "hiring_applications"("email", "cycle");
