-- CreateEnum
CREATE TYPE "ApplyingRole" AS ENUM ('TECHNICAL', 'DESIGNING', 'VIDEO_EDITING', 'MANAGEMENT');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'INTERVIEW_SCHEDULED', 'SELECTED', 'REJECTED');

-- CreateTable
CREATE TABLE "hiring_applications" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "department" TEXT NOT NULL,
    "year" TEXT NOT NULL,
    "skills" TEXT,
    "applying_role" "ApplyingRole" NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hiring_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hiring_applications_email_key" ON "hiring_applications"("email");

-- CreateIndex
CREATE INDEX "hiring_applications_status_idx" ON "hiring_applications"("status");

-- CreateIndex
CREATE INDEX "hiring_applications_applying_role_idx" ON "hiring_applications"("applying_role");

-- AddForeignKey
ALTER TABLE "hiring_applications" ADD CONSTRAINT "hiring_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
