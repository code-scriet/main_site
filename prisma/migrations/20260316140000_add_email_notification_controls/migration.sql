-- AlterTable: Add email notification category toggles and testing mode to settings
ALTER TABLE "settings" ADD COLUMN "email_welcome_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "settings" ADD COLUMN "email_event_creation_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "settings" ADD COLUMN "email_registration_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "settings" ADD COLUMN "email_announcement_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "settings" ADD COLUMN "email_certificate_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "settings" ADD COLUMN "email_reminder_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "settings" ADD COLUMN "email_testing_mode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "settings" ADD COLUMN "email_test_recipients" TEXT;
