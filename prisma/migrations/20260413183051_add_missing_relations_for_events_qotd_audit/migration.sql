-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "qotd" ADD COLUMN     "created_by_id" TEXT;

-- Normalize legacy orphan references before adding nullable foreign keys
UPDATE "qotd"
SET "created_by_id" = NULL
WHERE "created_by_id" IS NOT NULL
	AND NOT EXISTS (
		SELECT 1 FROM "users" WHERE "users"."id" = "qotd"."created_by_id"
	);

UPDATE "audit_logs"
SET "user_id" = NULL
WHERE "user_id" IS NOT NULL
	AND NOT EXISTS (
		SELECT 1 FROM "users" WHERE "users"."id" = "audit_logs"."user_id"
	);

-- CreateIndex
CREATE INDEX "qotd_created_by_id_idx" ON "qotd"("created_by_id");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "qotd" ADD CONSTRAINT "qotd_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
