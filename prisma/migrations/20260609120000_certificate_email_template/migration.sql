-- AlterTable: remember the email delivery template (and signer) chosen at certificate
-- generation time, so the admin "resend email" action replays the same template.
ALTER TABLE "certificates" ADD COLUMN "email_template" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "certificates" ADD COLUMN "email_signer_name" TEXT;
