-- Contest redesign — Phase A (scoring engine + proctoring/monitor/clarification state).
--
-- All additive and idempotent (safe to (re)apply on a drifted DB):
--   * new enums CompetitionPenaltyModel + CompetitionViolationKind
--   * competition_rounds gains contest config (final_weight, proctored, penalty_model,
--     leaderboard_freeze_minutes, difficulty_weights) — all defaulted, no backfill needed
--   * problem_submissions gains CONTEST-only ICPC penalty bookkeeping
--     (contest_wrong_attempts, contest_solved_at) — null/0 for every existing row
--   * three new tables: competition_participant_states (proctor lock + monitor heartbeat),
--     competition_violations (proctor log), competition_clarifications (admin broadcast)
--
-- Nothing here is required by the pre-Phase-A code paths, so an un-migrated instance
-- keeps running; the new code reads these only for CONTEST rounds.

-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "CompetitionPenaltyModel" AS ENUM ('BEST_SCORE', 'ICPC');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "CompetitionViolationKind" AS ENUM ('BLUR', 'HIDDEN', 'CLICK_OUT', 'FULLSCREEN_EXIT', 'COPY_PASTE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterTable: competition_rounds contest config
ALTER TABLE "competition_rounds" ADD COLUMN IF NOT EXISTS "final_weight" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "competition_rounds" ADD COLUMN IF NOT EXISTS "proctored" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "competition_rounds" ADD COLUMN IF NOT EXISTS "penalty_model" "CompetitionPenaltyModel" NOT NULL DEFAULT 'BEST_SCORE';
ALTER TABLE "competition_rounds" ADD COLUMN IF NOT EXISTS "leaderboard_freeze_minutes" INTEGER;
ALTER TABLE "competition_rounds" ADD COLUMN IF NOT EXISTS "difficulty_weights" JSONB;

-- AlterTable: problem_submissions CONTEST penalty bookkeeping
ALTER TABLE "problem_submissions" ADD COLUMN IF NOT EXISTS "contest_wrong_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "problem_submissions" ADD COLUMN IF NOT EXISTS "contest_solved_at" TIMESTAMP(3);

-- CreateTable: competition_participant_states
CREATE TABLE IF NOT EXISTS "competition_participant_states" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "lock_reason" TEXT,
    "locked_at" TIMESTAMP(3),
    "unlocked_by" TEXT,
    "unlocked_at" TIMESTAMP(3),
    "violation_count" INTEGER NOT NULL DEFAULT 0,
    "last_violation_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "competition_participant_states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "competition_participant_states_round_id_user_id_key" ON "competition_participant_states"("round_id", "user_id");
CREATE INDEX IF NOT EXISTS "competition_participant_states_round_id_locked_idx" ON "competition_participant_states"("round_id", "locked");
CREATE INDEX IF NOT EXISTS "competition_participant_states_round_id_last_seen_at_idx" ON "competition_participant_states"("round_id", "last_seen_at");

-- CreateTable: competition_violations
CREATE TABLE IF NOT EXISTS "competition_violations" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "CompetitionViolationKind" NOT NULL,
    "detail" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "competition_violations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "competition_violations_round_id_at_idx" ON "competition_violations"("round_id", "at");
CREATE INDEX IF NOT EXISTS "competition_violations_round_id_user_id_idx" ON "competition_violations"("round_id", "user_id");

-- CreateTable: competition_clarifications
CREATE TABLE IF NOT EXISTS "competition_clarifications" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "competition_clarifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "competition_clarifications_round_id_created_at_idx" ON "competition_clarifications"("round_id", "created_at");

-- Foreign keys (idempotent — added only if missing)
DO $$ BEGIN
  ALTER TABLE "competition_participant_states" ADD CONSTRAINT "competition_participant_states_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "competition_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "competition_participant_states" ADD CONSTRAINT "competition_participant_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "competition_violations" ADD CONSTRAINT "competition_violations_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "competition_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "competition_violations" ADD CONSTRAINT "competition_violations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "competition_clarifications" ADD CONSTRAINT "competition_clarifications_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "competition_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "competition_clarifications" ADD CONSTRAINT "competition_clarifications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
