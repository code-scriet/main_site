-- AlterTable
ALTER TABLE "events" ADD COLUMN     "day_labels" JSONB,
ADD COLUMN     "event_days" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "day_attendances" (
    "id" TEXT NOT NULL,
    "registration_id" TEXT NOT NULL,
    "day_number" INTEGER NOT NULL,
    "attended" BOOLEAN NOT NULL DEFAULT false,
    "scanned_at" TIMESTAMP(3),
    "scanned_by" TEXT,
    "manual_override" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "day_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "day_attendances_registration_id_idx" ON "day_attendances"("registration_id");

-- CreateIndex
CREATE UNIQUE INDEX "day_attendances_registration_id_day_number_key" ON "day_attendances"("registration_id", "day_number");

-- AddForeignKey
ALTER TABLE "day_attendances" ADD CONSTRAINT "day_attendances_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
