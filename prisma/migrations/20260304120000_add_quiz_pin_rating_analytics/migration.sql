-- AlterTable: Add PIN system fields to quizzes
ALTER TABLE "quizzes" ADD COLUMN "pin" VARCHAR(6);
ALTER TABLE "quizzes" ADD COLUMN "pin_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "quizzes" ADD COLUMN "total_participants" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Add per-question analytics to quiz_questions
ALTER TABLE "quiz_questions" ADD COLUMN "total_answers" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "quiz_questions" ADD COLUMN "correct_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "quiz_questions" ADD COLUMN "avg_answer_time_ms" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "quiz_questions" ADD COLUMN "answer_distribution" JSONB;

-- AlterTable: Add mid-quiz tracking to quiz_participants
ALTER TABLE "quiz_participants" ADD COLUMN "joined_mid_quiz" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "quiz_participants" ADD COLUMN "questions_answered" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Make is_correct nullable on quiz_answers (for POLL/RATING)
ALTER TABLE "quiz_answers" ALTER COLUMN "is_correct" DROP NOT NULL;
ALTER TABLE "quiz_answers" ALTER COLUMN "is_correct" DROP DEFAULT;

-- AlterEnum: Add RATING to QuizQuestionType
ALTER TYPE "QuizQuestionType" ADD VALUE 'RATING';

-- CreateIndex
CREATE UNIQUE INDEX "quizzes_pin_key" ON "quizzes"("pin");
CREATE INDEX "idx_quizzes_pin" ON "quizzes"("pin");
