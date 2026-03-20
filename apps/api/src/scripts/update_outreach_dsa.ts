import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.teamMember.updateMany({
    where: { team: 'Outreach' },
    data: { team: 'DSA' },
  });
  console.info(`Updated ${result.count} team members from Outreach to DSA.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
