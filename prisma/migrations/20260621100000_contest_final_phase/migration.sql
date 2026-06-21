-- Contest final phase (team scoring + event-final + plagiarism).
--
-- All additive + idempotent (safe to (re)apply on a drifted DB):
--   * competition_rounds.team_aggregation — how a team folds its members on a DSA round
--   * events.competition_final_published_at — event-final public-visibility marker
--   * settings.plagiarism_check_enabled — admin toggle for the similarity check
--   * competition_plagiarism_flags — review-only suspicious pairs (prune with the round)
--   * enums TeamAggregation + PlagiarismFlagStatus
--
-- Nothing here is required by pre-phase code: defaults cover existing rows, and the
-- plagiarism table/flag is only read when the toggle is on.

-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "TeamAggregation" AS ENUM ('BEST_PER_PROBLEM', 'AVERAGE', 'BEST_MEMBER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PlagiarismFlagStatus" AS ENUM ('PENDING', 'REVIEWED', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterTable
ALTER TABLE "competition_rounds" ADD COLUMN IF NOT EXISTS "team_aggregation" "TeamAggregation" NOT NULL DEFAULT 'BEST_PER_PROBLEM';
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "competition_final_published_at" TIMESTAMP(3);
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "plagiarism_check_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "competition_plagiarism_flags" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "problem_id" TEXT NOT NULL,
    "user_a_id" TEXT NOT NULL,
    "user_a_name" TEXT NOT NULL,
    "user_b_id" TEXT NOT NULL,
    "user_b_name" TEXT NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "status" "PlagiarismFlagStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "competition_plagiarism_flags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "competition_plagiarism_flags_round_id_problem_id_user_a_id_user_b_id_key" ON "competition_plagiarism_flags"("round_id", "problem_id", "user_a_id", "user_b_id");
CREATE INDEX IF NOT EXISTS "competition_plagiarism_flags_round_id_status_idx" ON "competition_plagiarism_flags"("round_id", "status");

DO $$ BEGIN
  ALTER TABLE "competition_plagiarism_flags" ADD CONSTRAINT "competition_plagiarism_flags_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "competition_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
