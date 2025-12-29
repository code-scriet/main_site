-- AlterTable
ALTER TABLE "events" ADD COLUMN     "event_type" TEXT,
ADD COLUMN     "prerequisites" TEXT,
ADD COLUMN     "registration_end_date" TIMESTAMP(3),
ADD COLUMN     "registration_start_date" TIMESTAMP(3),
ADD COLUMN     "venue" TEXT;
