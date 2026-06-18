-- Admin "reopen a past QOTD" support.
--
-- When reopened_at is set, the QOTD accepts submissions again through a private
-- signed link (purpose 'qotd_reopen') even though its date has passed — streak,
-- marks and leaderboard all update normally because the submission is recorded
-- against the (already-published) QOTD's date. reopened_by is a plain-string
-- actor snapshot. Written idempotently so it is safe to (re)apply on a drifted DB.

ALTER TABLE "qotd" ADD COLUMN IF NOT EXISTS "reopened_at" TIMESTAMP(3);
ALTER TABLE "qotd" ADD COLUMN IF NOT EXISTS "reopened_by" TEXT;
