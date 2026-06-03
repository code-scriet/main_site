-- AlterTable: public contact-page channels.
-- contact_phone backs the "Call us" / WhatsApp card; contact_emails is an
-- admin-managed JSON list of { label, email } shown alongside the primary
-- club_email so multiple departments can be reached. Both additive + nullable.
ALTER TABLE "settings" ADD COLUMN "contact_phone" TEXT;
ALTER TABLE "settings" ADD COLUMN "contact_emails" JSONB;
