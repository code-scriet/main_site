-- CreateTable
CREATE TABLE IF NOT EXISTS "signatories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Club President',
    "signature_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signatories_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "certificates"
    ADD COLUMN IF NOT EXISTS "description" TEXT,
    ADD COLUMN IF NOT EXISTS "signatory_id" TEXT,
    ADD COLUMN IF NOT EXISTS "signatory_name" TEXT,
    ADD COLUMN IF NOT EXISTS "signatory_title" TEXT,
    ADD COLUMN IF NOT EXISTS "signatory_image_url" TEXT,
    ADD COLUMN IF NOT EXISTS "faculty_signatory_id" TEXT,
    ADD COLUMN IF NOT EXISTS "faculty_name" TEXT,
    ADD COLUMN IF NOT EXISTS "faculty_title" TEXT,
    ADD COLUMN IF NOT EXISTS "faculty_signatory_image_url" TEXT,
    ADD COLUMN IF NOT EXISTS "last_email_resent_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "certificates_event_id_issued_at_idx" ON "certificates"("event_id", "issued_at");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'certificates_signatory_id_fkey'
  ) THEN
    ALTER TABLE "certificates"
      ADD CONSTRAINT "certificates_signatory_id_fkey"
      FOREIGN KEY ("signatory_id")
      REFERENCES "signatories"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'certificates_faculty_signatory_id_fkey'
  ) THEN
    ALTER TABLE "certificates"
      ADD CONSTRAINT "certificates_faculty_signatory_id_fkey"
      FOREIGN KEY ("faculty_signatory_id")
      REFERENCES "signatories"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
