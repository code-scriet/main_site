-- CreateTable
CREATE TABLE "event_teams" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "team_name" VARCHAR(100) NOT NULL,
    "invite_code" VARCHAR(8) NOT NULL,
    "leader_id" TEXT NOT NULL,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_team_members" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "registration_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_team_members_pkey" PRIMARY KEY ("id")
);

-- Add team registration fields to events table
ALTER TABLE "events" ADD COLUMN "team_registration" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "events" ADD COLUMN "team_min_size" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "events" ADD COLUMN "team_max_size" INTEGER NOT NULL DEFAULT 4;

-- CreateIndex
CREATE UNIQUE INDEX "event_teams_invite_code_key" ON "event_teams"("invite_code");

-- CreateIndex
CREATE INDEX "event_teams_invite_code_idx" ON "event_teams"("invite_code");

-- CreateIndex
CREATE INDEX "event_teams_event_id_idx" ON "event_teams"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_teams_event_id_team_name_key" ON "event_teams"("event_id", "team_name");

-- CreateIndex
CREATE UNIQUE INDEX "event_team_members_registration_id_key" ON "event_team_members"("registration_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_team_members_team_id_user_id_key" ON "event_team_members"("team_id", "user_id");

-- AddForeignKey
ALTER TABLE "event_teams" ADD CONSTRAINT "event_teams_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_teams" ADD CONSTRAINT "event_teams_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_team_members" ADD CONSTRAINT "event_team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "event_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_team_members" ADD CONSTRAINT "event_team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_team_members" ADD CONSTRAINT "event_team_members_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
