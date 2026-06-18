-- Streak-share card support (S-03 follow-up).
--
-- Stores the most recent Cloudinary URL of the user's generated streak card so the
-- public GET /share/streak/:userId route can serve it as og:image (LinkedIn renders
-- it in the post preview). Nullable, additive. Written idempotently so it is safe to
-- (re)apply on a drifted DB.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "streak_card_url" TEXT;
