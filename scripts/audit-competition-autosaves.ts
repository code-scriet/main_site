import { makePrismaClient } from './prismaClient.js';

const prisma = makePrismaClient();

type MissingUserAutoSaveRow = {
  id: string;
  roundId: string;
  roundTitle: string | null;
  eventId: string | null;
  userId: string;
  teamId: string | null;
  savedAt: Date;
};

type MissingTeamAutoSaveRow = {
  id: string;
  roundId: string;
  roundTitle: string | null;
  eventId: string | null;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  teamId: string;
  savedAt: Date;
};

function formatRows(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    ...row,
    savedAt: row.savedAt instanceof Date ? row.savedAt.toISOString() : row.savedAt,
  }));
}

async function main() {
  const missingUsers = await prisma.$queryRaw<MissingUserAutoSaveRow[]>`
    SELECT
      cas."id" AS "id",
      cas."round_id" AS "roundId",
      cr."title" AS "roundTitle",
      cr."event_id" AS "eventId",
      cas."user_id" AS "userId",
      cas."team_id" AS "teamId",
      cas."saved_at" AS "savedAt"
    FROM "competition_auto_saves" cas
    LEFT JOIN "competition_rounds" cr ON cr."id" = cas."round_id"
    LEFT JOIN "users" u ON u."id" = cas."user_id"
    WHERE u."id" IS NULL
    ORDER BY cas."saved_at" DESC
  `;

  const missingTeams = await prisma.$queryRaw<MissingTeamAutoSaveRow[]>`
    SELECT
      cas."id" AS "id",
      cas."round_id" AS "roundId",
      cr."title" AS "roundTitle",
      cr."event_id" AS "eventId",
      cas."user_id" AS "userId",
      u."name" AS "userName",
      u."email" AS "userEmail",
      cas."team_id" AS "teamId",
      cas."saved_at" AS "savedAt"
    FROM "competition_auto_saves" cas
    LEFT JOIN "competition_rounds" cr ON cr."id" = cas."round_id"
    INNER JOIN "users" u ON u."id" = cas."user_id"
    LEFT JOIN "event_teams" et ON et."id" = cas."team_id"
    WHERE cas."team_id" IS NOT NULL
      AND et."id" IS NULL
    ORDER BY cas."saved_at" DESC
  `;

  console.log('Competition auto-save orphan audit');
  console.log(JSON.stringify({
    rowsMissingUsers: missingUsers.length,
    rowsMissingTeamsButKeepingUser: missingTeams.length,
  }, null, 2));

  if (missingUsers.length > 0) {
    console.log('\nRows whose owning user no longer exists and would be deleted:');
    console.table(formatRows(missingUsers));
  }

  if (missingTeams.length > 0) {
    console.log('\nRows whose team no longer exists and would keep the save but null team_id:');
    console.table(formatRows(missingTeams));
  }

  if (missingUsers.length === 0 && missingTeams.length === 0) {
    console.log('\nNo orphaned competition auto-saves found.');
  }
}

main()
  .catch((error) => {
    console.error('Failed to audit competition auto-saves.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
