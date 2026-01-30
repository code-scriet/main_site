-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "email_announcement_body" TEXT,
ADD COLUMN     "email_event_body" TEXT,
ADD COLUMN     "email_footer_text" TEXT,
ADD COLUMN     "email_welcome_body" TEXT;
