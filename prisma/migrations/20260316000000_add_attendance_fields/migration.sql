-- Add attendance fields to EventRegistration
ALTER TABLE "event_registrations" ADD COLUMN IF NOT EXISTS "attendance_token" TEXT;
ALTER TABLE "event_registrations" ADD COLUMN IF NOT EXISTS "attended" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "event_registrations" ADD COLUMN IF NOT EXISTS "scanned_at" TIMESTAMP(3);
ALTER TABLE "event_registrations" ADD COLUMN IF NOT EXISTS "manual_override" BOOLEAN NOT NULL DEFAULT false;

-- Unique index on attendance_token
CREATE UNIQUE INDEX "event_registrations_attendance_token_key" ON "event_registrations"("attendance_token");

-- Composite index for efficient attendance queries
CREATE INDEX "event_registrations_eventId_attended_idx" ON "event_registrations"("event_id", "attended");
