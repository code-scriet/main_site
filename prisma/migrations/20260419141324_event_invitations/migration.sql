-- CreateEnum
CREATE TYPE "RegistrationType" AS ENUM ('PARTICIPANT', 'GUEST');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED');

-- AlterTable
ALTER TABLE "event_registrations" ADD COLUMN     "registration_type" "RegistrationType" NOT NULL DEFAULT 'PARTICIPANT';

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "email_invitation_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "event_invitations" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "invitee_user_id" TEXT,
    "invitee_email" VARCHAR(255),
    "invitee_name_snapshot" VARCHAR(200),
    "invitee_designation_snapshot" VARCHAR(200),
    "invitee_company_snapshot" VARCHAR(200),
    "role" VARCHAR(50) NOT NULL DEFAULT 'Guest',
    "custom_message" TEXT,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "certificate_enabled" BOOLEAN NOT NULL DEFAULT true,
    "certificate_type" "CertType" NOT NULL DEFAULT 'SPEAKER',
    "invited_by_id" TEXT NOT NULL,
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "email_sent" BOOLEAN NOT NULL DEFAULT false,
    "email_sent_at" TIMESTAMP(3),
    "last_email_resent_at" TIMESTAMP(3),
    "registration_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_invitations_registration_id_key" ON "event_invitations"("registration_id");

-- CreateIndex
CREATE INDEX "event_invitations_invitee_user_id_status_idx" ON "event_invitations"("invitee_user_id", "status");

-- CreateIndex
CREATE INDEX "event_invitations_invitee_email_status_idx" ON "event_invitations"("invitee_email", "status");

-- CreateIndex
CREATE INDEX "event_invitations_event_id_status_idx" ON "event_invitations"("event_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "event_invitations_event_id_invitee_user_id_key" ON "event_invitations"("event_id", "invitee_user_id");

-- CreateIndex
CREATE INDEX "event_registrations_event_id_registration_type_attended_idx" ON "event_registrations"("event_id", "registration_type", "attended");

-- AddForeignKey
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_invitee_user_id_fkey" FOREIGN KEY ("invitee_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
