-- S-10: post-event "thanks for coming + feedback poll" wiring.
--
--   • events.feedback_sent_at — per-event reservation marker so the 6h scheduler
--     tick sends the feedback request exactly once (mirrors reminder_sent_at).
--   • polls.event_id — optional link making a poll the feedback poll for an event;
--     the scheduler only emails when a PUBLISHED poll is linked (the organizer's
--     opt-in: publish a feedback poll for the event).
--
-- Written idempotently so it is safe to (re)apply even if prod has drifted.

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "feedback_sent_at" TIMESTAMP(3);

ALTER TABLE "polls" ADD COLUMN IF NOT EXISTS "event_id" TEXT;

CREATE INDEX IF NOT EXISTS "polls_event_id_idx" ON "polls" ("event_id");

-- FK polls.event_id -> events.id (SET NULL on delete). Guarded so re-apply is a no-op.
DO $$ BEGIN
  ALTER TABLE "polls"
    ADD CONSTRAINT "polls_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
