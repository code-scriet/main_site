-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "show_achievements" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "show_leaderboard" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "show_qotd" BOOLEAN NOT NULL DEFAULT true;
