-- CreateEnum
CREATE TYPE "CertType" AS ENUM ('PARTICIPATION', 'COMPLETION', 'WINNER', 'SPEAKER');

-- AlterTable: Add certificates relation to users (no column change needed — handled by FK on Certificate)

-- AlterTable: Add certificates relation to events (no column change needed — handled by FK on Certificate)

-- CreateTable
CREATE TABLE "certificates" (
    "id" TEXT NOT NULL,
    "cert_id" TEXT NOT NULL,
    "recipient_id" TEXT,
    "recipient_name" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "event_id" TEXT,
    "event_name" TEXT NOT NULL,
    "type" "CertType" NOT NULL,
    "position" TEXT,
    "domain" TEXT,
    "template" TEXT NOT NULL DEFAULT 'gold',
    "pdf_url" TEXT,
    "qr_code_url" TEXT,
    "issued_by" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email_sent" BOOLEAN NOT NULL DEFAULT false,
    "email_sent_at" TIMESTAMP(3),
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "revoked_at" TIMESTAMP(3),
    "revoked_by" TEXT,
    "revoked_reason" TEXT,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificates_cert_id_key" ON "certificates"("cert_id");

-- CreateIndex
CREATE INDEX "certificates_recipient_id_idx" ON "certificates"("recipient_id");

-- CreateIndex
CREATE INDEX "certificates_event_id_idx" ON "certificates"("event_id");

-- CreateIndex
CREATE INDEX "certificates_cert_id_idx" ON "certificates"("cert_id");

-- CreateIndex
CREATE INDEX "certificates_recipient_email_idx" ON "certificates"("recipient_email");

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
