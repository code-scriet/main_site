import { makePrismaClient } from '../scripts/prismaClient.js';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = makePrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  const defaultEmail = 'admin@example.com';
  const defaultPassword = 'change_this_password';

  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || defaultEmail).trim().toLowerCase();
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || defaultPassword;
  const superAdminName = (process.env.SUPER_ADMIN_NAME || 'Super Admin').trim();

  if (!superAdminEmail || !superAdminPassword) {
    throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be provided');
  }

  if (
    process.env.NODE_ENV === 'production' &&
    (superAdminEmail === defaultEmail || superAdminPassword === defaultPassword)
  ) {
    throw new Error('Production seed requires non-default SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD');
  }

  // Hash the password for storage
  const hashedPassword = await bcrypt.hash(superAdminPassword, 12);

  // Create or update super admin user with password
  const admin = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {
      password: hashedPassword, // Update password if user exists
    },
    create: {
      name: superAdminName,
      email: superAdminEmail,
      password: hashedPassword,
      oauthProvider: 'email',
      oauthId: `email-${Date.now()}`,
      role: 'ADMIN',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${superAdminEmail}`,
    },
  });

  // Create default settings if they don't exist
  await prisma.settings.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      clubName: 'code.scriet',
      clubEmail: 'contact@codescriet.com',
      clubDescription: 'Building tomorrow\'s problem solvers through collaborative learning and hands-on coding experiences.',
    },
  });

  console.log('✅ Database seeded successfully!');
  console.log('📧 Super Admin created with email:', superAdminEmail);
  if (superAdminPassword === defaultPassword) {
    console.warn('⚠️  Using default super admin password. Set SUPER_ADMIN_PASSWORD before running in shared environments.');
  }
  console.log('\n🎯 Admin can now login and add events, teams, and other content through the admin panel.');
  console.log({
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
    },
  });
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
