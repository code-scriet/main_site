-- Admin acceptance for reopened-past-QOTD solves.
--
-- When a holder of a reopen link solves a past QOTD, the submission is judged but
-- HELD: its verdict stays PENDING and reopen_pending is set. It counts for nothing
-- (every streak/leaderboard query already filters verdict = 'ACCEPTED') until an
-- admin accepts it from the review queue, which flips verdict -> ACCEPTED and
-- recomputes the user's streak + leaderboard standing.
--
-- Written idempotently so it is safe to (re)apply on a drifted DB.

ALTER TABLE "problem_submissions" ADD COLUMN IF NOT EXISTS "reopen_pending" BOOLEAN NOT NULL DEFAULT false;
