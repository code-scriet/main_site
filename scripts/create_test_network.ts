import { NetworkConnectionType, NetworkStatus } from '@prisma/client';
import { makePrismaClient } from './prismaClient.js';
import bcrypt from 'bcryptjs';

const prisma = makePrismaClient();

async function main() {
  console.info('Creating test users & network profiles...');

  // 1. Alumni User
  let alumniUser = await prisma.user.findUnique({ where: { email: 'alumni@code.scriet' } });
  if (!alumniUser) {
    const hashedPassword = await bcrypt.hash('password123', 10);
    alumniUser = await prisma.user.create({
      data: {
        email: 'alumni@code.scriet',
        password: hashedPassword,
        name: 'Jane Doe Alumni',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=JaneDoe',
        bio: 'Former technical lead currently working at TechCorp. Love mentoring students and giving back to the community.',
        linkedinUrl: 'https://linkedin.com/in/janedoe',
        githubUrl: 'https://github.com/janedoe',
        websiteUrl: 'https://janedoe.me',
      },
    });
    console.info('Created user: alumni@code.scriet');
  }

  // Alumni Network Profile
  const existingAlumniProfile = await prisma.networkProfile.findUnique({ where: { userId: alumniUser.id } });
  if (!existingAlumniProfile) {
    await prisma.networkProfile.create({
      data: {
        userId: alumniUser.id,
        fullName: alumniUser.name,
        designation: 'Senior Software Engineer',
        company: 'TechCorp',
        industry: 'Software',
        connectionType: NetworkConnectionType.ALUMNI,
        status: NetworkStatus.VERIFIED,
        isPublic: true,
        passoutYear: 2022,
        degree: 'B.Tech',
        branch: 'Computer Science',
        achievements: 'Awarded Employee of the Year 2024 at TechCorp. Built the core scalable architecture for the new payment system.',
        slug: 'jane-doe-alumni',
      },
    });
    console.info('Created Alumni profile for Jane');
  }

  // 2. Network/Guest User
  let guestUser = await prisma.user.findUnique({ where: { email: 'guest@code.scriet' } });
  if (!guestUser) {
    const hashedPassword = await bcrypt.hash('password123', 10);
    guestUser = await prisma.user.create({
      data: {
        email: 'guest@code.scriet',
        password: hashedPassword,
        name: 'John Smith Guest',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=JohnSmith',
        bio: 'Product Manager with 10 years of experience. Guest speaker on product strategy.',
        linkedinUrl: 'https://linkedin.com/in/johnsmith',
        twitterUrl: 'https://twitter.com/johnsmith',
      },
    });
    console.info('Created user: guest@code.scriet');
  }

  // Guest Network Profile
  const existingGuestProfile = await prisma.networkProfile.findUnique({ where: { userId: guestUser.id } });
  if (!existingGuestProfile) {
    await prisma.networkProfile.create({
      data: {
        userId: guestUser.id,
        fullName: guestUser.name,
        designation: 'Product Manager',
        company: 'InnovateInc',
        industry: 'Product Management',
        connectionType: NetworkConnectionType.GUEST_SPEAKER,
        status: NetworkStatus.VERIFIED,
        isPublic: true,
        achievements: 'Led the successful launch of 3 flagship products reaching 1M+ active users. Speaker at TEDx.',
        slug: 'john-smith-guest',
      },
    });
    console.info('Created Guest Speaker profile for John');
  }

  console.info('Test setup complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
