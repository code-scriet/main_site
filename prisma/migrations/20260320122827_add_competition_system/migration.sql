/*
  Warnings:

  - You are about to drop the column `qr_code_url` on the `certificates` table. All the data in the column will be lost.
  - You are about to alter the column `role` on the `event_team_members` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(10)`.
  - A unique constraint covering the columns `[recipient_email,event_id,type]` on the table `certificates` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "CompetitionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'LOCKED', 'JUDGING', 'FINISHED');

-- AlterTable
ALTER TABLE "certificates" DROP COLUMN "qr_code_url";

-- AlterTable
ALTER TABLE "event_team_members" ALTER COLUMN "role" SET DATA TYPE VARCHAR(10);

-- AlterTable
ALTER TABLE "playground_daily_usage" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "competition_rounds" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "duration" INTEGER NOT NULL,
    "status" "CompetitionStatus" NOT NULL DEFAULT 'DRAFT',
    "target_image_url" TEXT,
    "started_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competition_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_submissions" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "team_id" TEXT,
    "user_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_auto_submit" BOOLEAN NOT NULL DEFAULT false,
    "score" DOUBLE PRECISION,
    "rank" INTEGER,
    "admin_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competition_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_auto_saves" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "team_id" TEXT,
    "user_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competition_auto_saves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "competition_rounds_event_id_idx" ON "competition_rounds"("event_id");

-- CreateIndex
CREATE INDEX "competition_rounds_status_started_at_idx" ON "competition_rounds"("status", "started_at");

-- CreateIndex
CREATE INDEX "competition_submissions_round_id_idx" ON "competition_submissions"("round_id");

-- CreateIndex
CREATE INDEX "competition_submissions_team_id_idx" ON "competition_submissions"("team_id");

-- CreateIndex
CREATE INDEX "competition_submissions_rank_score_idx" ON "competition_submissions"("rank", "score");

-- CreateIndex
CREATE UNIQUE INDEX "competition_submissions_round_id_team_id_key" ON "competition_submissions"("round_id", "team_id");

-- CreateIndex
CREATE UNIQUE INDEX "competition_submissions_round_id_user_id_key" ON "competition_submissions"("round_id", "user_id");

-- CreateIndex
CREATE INDEX "competition_auto_saves_round_id_idx" ON "competition_auto_saves"("round_id");

-- CreateIndex
CREATE INDEX "competition_auto_saves_team_id_idx" ON "competition_auto_saves"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "competition_auto_saves_round_id_user_id_key" ON "competition_auto_saves"("round_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_recipient_email_event_id_type_key" ON "certificates"("recipient_email", "event_id", "type");

-- AddForeignKey
ALTER TABLE "competition_rounds" ADD CONSTRAINT "competition_rounds_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_submissions" ADD CONSTRAINT "competition_submissions_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "competition_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_submissions" ADD CONSTRAINT "competition_submissions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "event_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_submissions" ADD CONSTRAINT "competition_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_auto_saves" ADD CONSTRAINT "competition_auto_saves_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "competition_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "event_registrations_eventId_attended_idx" RENAME TO "event_registrations_event_id_attended_idx";
