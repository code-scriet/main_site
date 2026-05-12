-- CreateEnum
CREATE TYPE "SubmissionVerdict" AS ENUM ('PENDING', 'ACCEPTED', 'WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED', 'RUNTIME_ERROR', 'COMPILATION_ERROR', 'JUDGE_ERROR');

-- CreateEnum
CREATE TYPE "ProblemContextType" AS ENUM ('QOTD', 'CONTEST', 'PRACTICE');

-- CreateEnum
CREATE TYPE "CompetitionRoundType" AS ENUM ('IMAGE_TARGET', 'DSA');

-- CreateEnum
CREATE TYPE "ProblemLanguage" AS ENUM ('PYTHON', 'JAVASCRIPT', 'CPP', 'JAVA');

-- AlterTable
ALTER TABLE "competition_rounds" ADD COLUMN     "round_type" "CompetitionRoundType" NOT NULL DEFAULT 'IMAGE_TARGET';

-- AlterTable
ALTER TABLE "qotd" ADD COLUMN     "problem_id" TEXT;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "problems_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "problems" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "difficulty" VARCHAR(10) NOT NULL,
    "tags" TEXT[],
    "allowed_languages" "ProblemLanguage"[],
    "time_limit_ms" INTEGER NOT NULL DEFAULT 2000,
    "default_submit_cap" INTEGER NOT NULL DEFAULT 5,
    "sample_tests" JSONB NOT NULL,
    "hidden_tests" JSONB NOT NULL,
    "reference_solution" TEXT,
    "reference_language" "ProblemLanguage",
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT NOT NULL,
    "test_cases_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problem_submissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "problem_id" TEXT NOT NULL,
    "context_type" "ProblemContextType" NOT NULL,
    "context_key" TEXT NOT NULL,
    "language" "ProblemLanguage" NOT NULL,
    "code" TEXT NOT NULL,
    "verdict" "SubmissionVerdict" NOT NULL,
    "score" INTEGER NOT NULL,
    "passed_count" INTEGER NOT NULL,
    "total_count" INTEGER NOT NULL,
    "per_test_verdicts" JSONB NOT NULL,
    "runtime_ms" INTEGER,
    "compiler_output" TEXT,
    "manual_override" BOOLEAN NOT NULL DEFAULT false,
    "override_notes" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problem_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problem_submission_counters" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "problem_id" TEXT NOT NULL,
    "context_type" "ProblemContextType" NOT NULL,
    "context_key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "cap_override" INTEGER,
    "last_reset_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problem_submission_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_round_problems" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "problem_id" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "competition_round_problems_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "problems_slug_key" ON "problems"("slug");

-- CreateIndex
CREATE INDEX "problems_is_published_difficulty_idx" ON "problems"("is_published", "difficulty");

-- CreateIndex
CREATE INDEX "problems_created_at_idx" ON "problems"("created_at");

-- CreateIndex
CREATE INDEX "problem_submissions_problem_id_context_type_context_key_idx" ON "problem_submissions"("problem_id", "context_type", "context_key");

-- CreateIndex
CREATE INDEX "problem_submissions_context_type_context_key_idx" ON "problem_submissions"("context_type", "context_key");

-- CreateIndex
CREATE INDEX "problem_submissions_user_id_submitted_at_idx" ON "problem_submissions"("user_id", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "problem_submissions_user_id_problem_id_context_type_context_key" ON "problem_submissions"("user_id", "problem_id", "context_type", "context_key");

-- CreateIndex
CREATE INDEX "problem_submission_counters_problem_id_context_type_context_idx" ON "problem_submission_counters"("problem_id", "context_type", "context_key");

-- CreateIndex
CREATE UNIQUE INDEX "problem_submission_counters_user_id_problem_id_context_type_key" ON "problem_submission_counters"("user_id", "problem_id", "context_type", "context_key");

-- CreateIndex
CREATE UNIQUE INDEX "competition_round_problems_round_id_problem_id_key" ON "competition_round_problems"("round_id", "problem_id");

-- CreateIndex
CREATE UNIQUE INDEX "competition_round_problems_round_id_display_order_key" ON "competition_round_problems"("round_id", "display_order");

-- CreateIndex
CREATE INDEX "qotd_problem_id_idx" ON "qotd"("problem_id");

-- AddForeignKey
ALTER TABLE "qotd" ADD CONSTRAINT "qotd_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_submissions" ADD CONSTRAINT "problem_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_submissions" ADD CONSTRAINT "problem_submissions_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_submission_counters" ADD CONSTRAINT "problem_submission_counters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_submission_counters" ADD CONSTRAINT "problem_submission_counters_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_round_problems" ADD CONSTRAINT "competition_round_problems_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "competition_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_round_problems" ADD CONSTRAINT "competition_round_problems_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
