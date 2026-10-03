-- Admin-editable "What to expect" copy for the interview booking card.
-- Additive only; safe to (re)apply.

ALTER TABLE "settings"
  ADD COLUMN IF NOT EXISTS "interview_what_to_expect" TEXT NOT NULL DEFAULT
  'A short conversation about your application, interests and availability. Bring your college ID and be ready to talk through one thing you have built or learned recently.';
