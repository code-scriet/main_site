import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('password123', 12);

  // Test User 1
  const user1 = await prisma.user.upsert({
    where: { email: 'test1@code.scriet' },
    update: {},
    create: {
      name: 'Test Member One',
      email: 'test1@code.scriet',
      password,
      role: 'USER',
      bio: 'This is my short bio from the user profile side.',
      githubUrl: 'https://github.com/test1',
      linkedinUrl: 'https://linkedin.com/in/test1',
      profileCompleted: true,
      course: 'B.Tech',
      branch: 'CSE',
      year: '3rd',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=TestMemberOne',
    },
  });

  // Test User 2
  const user2 = await prisma.user.upsert({
    where: { email: 'test2@code.scriet' },
    update: {},
    create: {
      name: 'Test Member Two',
      email: 'test2@code.scriet',
      password,
      role: 'USER',
      bio: 'Another bio from a different user.',
      twitterUrl: 'https://twitter.com/test2',
      profileCompleted: true,
      course: 'B.Tech',
      branch: 'IT',
      year: '2nd',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=TestMemberTwo',
    },
  });

  console.log('Created test users successfully. You can use these to test the sync logic.');
  console.log('\n--- Credentials ---');
  console.log('User 1:');
  console.log(`Email: test1@code.scriet`);
  console.log(`Password: password123`);
  console.log(`ID: ${user1.id}`);
  console.log('\nUser 2:');
  console.log(`Email: test2@code.scriet`);
  console.log(`Password: password123`);
  console.log(`ID: ${user2.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
