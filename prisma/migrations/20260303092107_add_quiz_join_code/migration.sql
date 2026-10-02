-- AlterTable
ALTER TABLE "quizzes" ADD COLUMN "join_code" VARCHAR(6);

-- CreateIndex
CREATE UNIQUE INDEX "quizzes_join_code_key" ON "quizzes"("join_code");
