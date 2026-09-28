-- Add emailAnnouncements preference to users (bulk announcements opt-out)
ALTER TABLE "users" ADD COLUMN "email_announcements" BOOLEAN NOT NULL DEFAULT true;
