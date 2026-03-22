-- CreateEnum
CREATE TYPE "CompetitionParticipantScope" AS ENUM ('ALL', 'SELECTED_TEAMS');

-- AlterTable
ALTER TABLE "competition_rounds" ADD COLUMN     "allowed_team_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "participant_scope" "CompetitionParticipantScope" NOT NULL DEFAULT 'ALL';
