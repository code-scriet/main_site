-- Add per-category email provider fields to Settings table
-- Defaults preserve current production behavior:
-- announcement, reminder, event_creation default to 'oci'
-- All other categories default to 'brevo'

ALTER TABLE "settings" ADD COLUMN "email_provider_welcome" VARCHAR(10) NOT NULL DEFAULT 'brevo';
ALTER TABLE "settings" ADD COLUMN "email_provider_event_creation" VARCHAR(10) NOT NULL DEFAULT 'oci';
ALTER TABLE "settings" ADD COLUMN "email_provider_registration" VARCHAR(10) NOT NULL DEFAULT 'brevo';
ALTER TABLE "settings" ADD COLUMN "email_provider_announcement" VARCHAR(10) NOT NULL DEFAULT 'oci';
ALTER TABLE "settings" ADD COLUMN "email_provider_certificate" VARCHAR(10) NOT NULL DEFAULT 'brevo';
ALTER TABLE "settings" ADD COLUMN "email_provider_reminder" VARCHAR(10) NOT NULL DEFAULT 'oci';
ALTER TABLE "settings" ADD COLUMN "email_provider_invitation" VARCHAR(10) NOT NULL DEFAULT 'brevo';
ALTER TABLE "settings" ADD COLUMN "email_provider_admin_mail" VARCHAR(10) NOT NULL DEFAULT 'brevo';
ALTER TABLE "settings" ADD COLUMN "email_provider_password_reset" VARCHAR(10) NOT NULL DEFAULT 'brevo';
ALTER TABLE "settings" ADD COLUMN "email_provider_other" VARCHAR(10) NOT NULL DEFAULT 'brevo';