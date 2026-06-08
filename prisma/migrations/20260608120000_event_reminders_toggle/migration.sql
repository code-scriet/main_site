-- Per-event reminder control.
-- When false, the reminder scheduler skips this event's registrations entirely.
-- Defaults to true so existing events keep their current (reminders-on) behaviour.
ALTER TABLE "events" ADD COLUMN "reminders_enabled" BOOLEAN NOT NULL DEFAULT true;
