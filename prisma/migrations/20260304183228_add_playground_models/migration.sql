-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('SUCCESS', 'ERROR', 'TIMEOUT');

-- CreateTable
CREATE TABLE "executions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration_ms" INTEGER,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'SUCCESS',

    CONSTRAINT "executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_playground_prefs" (
    "user_id" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "fontSize" INTEGER NOT NULL DEFAULT 14,
    "keybinding" TEXT NOT NULL DEFAULT 'default',
    "last_language" TEXT NOT NULL DEFAULT 'python',

    CONSTRAINT "user_playground_prefs_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "snippets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "share_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "snippets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "executions_user_id_executed_at_idx" ON "executions"("user_id", "executed_at");

-- CreateIndex
CREATE INDEX "executions_executed_at_idx" ON "executions"("executed_at");

-- CreateIndex
CREATE UNIQUE INDEX "snippets_share_token_key" ON "snippets"("share_token");

-- CreateIndex
CREATE INDEX "snippets_user_id_created_at_idx" ON "snippets"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "snippets_share_token_idx" ON "snippets"("share_token");
