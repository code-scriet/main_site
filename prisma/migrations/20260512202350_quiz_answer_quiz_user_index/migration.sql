-- CreateIndex
CREATE INDEX "idx_quiz_answers_quiz_user" ON "quiz_answers"("quiz_id", "user_id");
