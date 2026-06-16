-- Submission manual-review + appeal support.
--
-- When code execution/judging is fully down (Wandbox + Judge0 fallback both
-- failing), a submit is now PERSISTED with verdict=JUDGE_ERROR and
-- needs_review=true instead of being discarded — so the student's code is
-- captured and admins can grade it manually. Students can also appeal a
-- non-accepted submission (appealed_at / appeal_note), which flags it for
-- review too. Written idempotently so it is safe to (re)apply even if prod has
-- drifted.

ALTER TABLE "problem_submissions" ADD COLUMN IF NOT EXISTS "needs_review" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "problem_submissions" ADD COLUMN IF NOT EXISTS "appealed_at" TIMESTAMP(3);
ALTER TABLE "problem_submissions" ADD COLUMN IF NOT EXISTS "appeal_note" TEXT;

CREATE INDEX IF NOT EXISTS "problem_submissions_needs_review_updated_at_idx"
  ON "problem_submissions" ("needs_review", "updated_at");
