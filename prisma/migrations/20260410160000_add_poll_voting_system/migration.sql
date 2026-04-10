-- CreateTable
CREATE TABLE "polls" (
    "id" TEXT NOT NULL,
    "question" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "allow_multiple_choices" BOOLEAN NOT NULL DEFAULT false,
    "allow_vote_change" BOOLEAN NOT NULL DEFAULT true,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "deadline" TIMESTAMP(3),
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_options" (
    "id" TEXT NOT NULL,
    "poll_id" TEXT NOT NULL,
    "text" VARCHAR(240) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_votes" (
    "id" TEXT NOT NULL,
    "poll_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_vote_selections" (
    "vote_id" TEXT NOT NULL,
    "option_id" TEXT NOT NULL,

    CONSTRAINT "poll_vote_selections_pkey" PRIMARY KEY ("vote_id","option_id")
);

-- CreateTable
CREATE TABLE "poll_feedback" (
    "id" TEXT NOT NULL,
    "poll_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poll_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "polls_slug_key" ON "polls"("slug");

-- CreateIndex
CREATE INDEX "polls_created_by_idx" ON "polls"("created_by");

-- CreateIndex
CREATE INDEX "polls_published_created_at_desc_idx" ON "polls"("is_published", "created_at" DESC);

-- CreateIndex
CREATE INDEX "polls_deadline_published_idx" ON "polls"("deadline", "is_published");

-- CreateIndex
CREATE INDEX "poll_options_poll_id_idx" ON "poll_options"("poll_id");

-- CreateIndex
CREATE UNIQUE INDEX "poll_options_poll_id_sort_order_key" ON "poll_options"("poll_id", "sort_order");

-- CreateIndex
CREATE INDEX "poll_votes_poll_id_idx" ON "poll_votes"("poll_id");

-- CreateIndex
CREATE INDEX "poll_votes_user_id_idx" ON "poll_votes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "poll_votes_poll_id_user_id_key" ON "poll_votes"("poll_id", "user_id");

-- CreateIndex
CREATE INDEX "poll_vote_selections_option_id_idx" ON "poll_vote_selections"("option_id");

-- CreateIndex
CREATE INDEX "poll_feedback_poll_created_at_desc_idx" ON "poll_feedback"("poll_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "poll_feedback_user_id_idx" ON "poll_feedback"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "poll_feedback_poll_id_user_id_key" ON "poll_feedback"("poll_id", "user_id");

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_vote_selections" ADD CONSTRAINT "poll_vote_selections_vote_id_fkey" FOREIGN KEY ("vote_id") REFERENCES "poll_votes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_vote_selections" ADD CONSTRAINT "poll_vote_selections_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_feedback" ADD CONSTRAINT "poll_feedback_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_feedback" ADD CONSTRAINT "poll_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
