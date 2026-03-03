-- CreateEnum
CREATE TYPE "QuizStatus" AS ENUM ('DRAFT', 'WAITING', 'ACTIVE', 'FINISHED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "QuizQuestionType" AS ENUM ('MCQ', 'TRUE_FALSE', 'SHORT_ANSWER', 'POLL');

-- DropIndex
DROP INDEX "network_profiles_legacy_slugs_gin_idx";

-- DropIndex
DROP INDEX "team_members_legacy_slugs_gin_idx";

-- CreateTable
CREATE TABLE "quizzes" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "created_by" TEXT NOT NULL,
    "status" "QuizStatus" NOT NULL DEFAULT 'DRAFT',
    "current_question_index" INTEGER NOT NULL DEFAULT -1,
    "question_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_questions" (
    "id" TEXT NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "question_text" TEXT NOT NULL,
    "question_type" "QuizQuestionType" NOT NULL DEFAULT 'MCQ',
    "options" JSONB,
    "correct_answer" TEXT,
    "time_limit_seconds" INTEGER NOT NULL DEFAULT 20,
    "points" INTEGER NOT NULL DEFAULT 100,
    "media_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_participants" (
    "id" TEXT NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "final_score" INTEGER NOT NULL DEFAULT 0,
    "final_rank" INTEGER,
    "correct_count" INTEGER NOT NULL DEFAULT 0,
    "total_answer_time_ms" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "quiz_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_answers" (
    "id" TEXT NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "answer_submitted" TEXT,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "points_awarded" INTEGER NOT NULL DEFAULT 0,
    "answer_time_ms" INTEGER NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_quizzes_status" ON "quizzes"("status");

-- CreateIndex
CREATE INDEX "idx_quizzes_created_by" ON "quizzes"("created_by");

-- CreateIndex
CREATE INDEX "idx_quiz_questions_quiz_position" ON "quiz_questions"("quiz_id", "position");

-- CreateIndex
CREATE INDEX "idx_quiz_participants_user_id" ON "quiz_participants"("user_id");

-- CreateIndex
CREATE INDEX "idx_quiz_participants_quiz_id" ON "quiz_participants"("quiz_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_participants_quiz_id_user_id_key" ON "quiz_participants"("quiz_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_quiz_answers_question_id" ON "quiz_answers"("question_id");

-- CreateIndex
CREATE INDEX "idx_quiz_answers_user_id" ON "quiz_answers"("user_id");

-- CreateIndex
CREATE INDEX "idx_quiz_answers_quiz_id" ON "quiz_answers"("quiz_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_answers_question_id_user_id_key" ON "quiz_answers"("question_id", "user_id");

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_participants" ADD CONSTRAINT "quiz_participants_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_participants" ADD CONSTRAINT "quiz_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "quiz_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
