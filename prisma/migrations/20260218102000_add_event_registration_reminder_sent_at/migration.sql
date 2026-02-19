ALTER TABLE "event_registrations"
ADD COLUMN "reminder_sent_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "event_registrations_reminder_sent_at_idx"
  ON "event_registrations"("reminder_sent_at");
