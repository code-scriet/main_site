-- Interview scheduling (Phase 0) — additive only, no backfill.
--
-- New: interview_slots + interview_slot_bookings + interview_slot_tokens +
-- interview_reminder_logs tables; SLOT_BOOKED / INTERVIEWED application
-- statuses; Announcement audience targeting (ALL | HIRING_COHORT);
-- Settings.recruitment email toggle + provider columns.
--
-- Every statement is IF NOT EXISTS / IF NOT EXISTS-safe so this is safe to
-- (re)apply on a drifted database. Code degrades gracefully when unapplied:
-- the hiring-slots router mounts only when its tables exist (see hiringSlots.ts).
-- No database was touched to author this migration (hand-written from the
-- Prisma schema; local dev DB has unrelated oppe-branch drift, so
-- `migrate dev` cannot run there — apply via `migrate deploy`).

-- AlterEnum: additive statuses for the interview pipeline
ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'SLOT_BOOKED';
ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'INTERVIEWED';

-- CreateEnum: announcement audience
DO $$ BEGIN
  CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL', 'HIRING_COHORT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: announcements audience targeting
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "audience" "AnnouncementAudience" NOT NULL DEFAULT 'ALL';
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "audience_cycle" TEXT;

-- CreateIndex: audience filter for the visibility rule
CREATE INDEX IF NOT EXISTS "announcements_audience_audience_cycle_idx" ON "announcements"("audience", "audience_cycle");

-- AlterTable: Settings recruitment email category (toggle + provider, default brevo)
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "email_provider_recruitment" VARCHAR(10) NOT NULL DEFAULT 'brevo';
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "email_recruitment_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable: interview_slots (per hiring cycle, UTC window, optional role tag)
CREATE TABLE "interview_slots" (
    "id" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "booked_count" INTEGER NOT NULL DEFAULT 0,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "applying_role" "ApplyingRole",
    "venue" TEXT,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "interview_slots_cycle_starts_at_idx" ON "interview_slots"("cycle", "starts_at");

-- CreateTable: interview_slot_bookings (ONE booking per application — the race backstop)
CREATE TABLE "interview_slot_bookings" (
    "id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "booked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_slot_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "interview_slot_bookings_application_id_key" ON "interview_slot_bookings"("application_id");
CREATE INDEX IF NOT EXISTS "interview_slot_bookings_slot_id_idx" ON "interview_slot_bookings"("slot_id");

-- CreateTable: interview_slot_tokens (magic-link tokens, SHA-256 hash only)
CREATE TABLE "interview_slot_tokens" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_slot_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "interview_slot_tokens_application_id_key" ON "interview_slot_tokens"("application_id");
CREATE UNIQUE INDEX IF NOT EXISTS "interview_slot_tokens_token_hash_key" ON "interview_slot_tokens"("token_hash");

-- CreateTable: interview_reminder_logs (48h / 24h pick-a-slot reminders, sent exactly once)
CREATE TABLE "interview_reminder_logs" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "threshold" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_reminder_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "interview_reminder_logs_application_id_threshold_key" ON "interview_reminder_logs"("application_id", "threshold");

-- AddForeignKey
ALTER TABLE "interview_slots" ADD CONSTRAINT "interview_slots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_slot_bookings" ADD CONSTRAINT "interview_slot_bookings_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "interview_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_slot_bookings" ADD CONSTRAINT "interview_slot_bookings_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "hiring_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_slot_tokens" ADD CONSTRAINT "interview_slot_tokens_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "hiring_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_reminder_logs" ADD CONSTRAINT "interview_reminder_logs_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "hiring_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
