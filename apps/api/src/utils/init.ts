import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { logger } from './logger.js';

const prisma = new PrismaClient();

export async function initializeDatabase() {
  try {
    logger.info('🔧 Initializing database...');

    // Get super admin credentials from environment variables
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
    const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD;
    const superAdminName = process.env.SUPER_ADMIN_NAME || 'Super Admin';

    // Check if super admin credentials are provided
    if (!superAdminEmail || !superAdminPassword) {
      logger.warn('⚠️ SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD not set. Skipping admin creation.');
      logger.warn('⚠️ Set these environment variables to auto-create the super admin user.');
    } else {
      // Check if admin already exists
      const existingAdmin = await prisma.user.findUnique({
        where: { email: superAdminEmail },
      });

      if (!existingAdmin) {
        // Hash the password for storage
        const hashedPassword = await bcrypt.hash(superAdminPassword, 12);

        // Create super admin user
        const admin = await prisma.user.create({
          data: {
            name: superAdminName,
            email: superAdminEmail,
            password: hashedPassword,
            oauthProvider: 'email',
            oauthId: `email-${Date.now()}`,
            role: 'ADMIN',
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${superAdminEmail}`,
          },
        });

        logger.info('✅ Super Admin user created:', {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
        });
      } else {
        logger.info('✅ Super Admin user already exists:', {
          id: existingAdmin.id,
          email: existingAdmin.email,
        });
      }
    }

    // Create default settings if they don't exist
    const existingSettings = await prisma.settings.findUnique({
      where: { id: 'default' },
    });

    if (!existingSettings) {
      await prisma.settings.create({
        data: {
          id: 'default',
          clubName: 'code.scriet',
          clubEmail: 'contact@codescriet.com',
          clubDescription: 'Building tomorrow\'s problem solvers through collaborative learning and hands-on coding experiences.',
        },
      });
      logger.info('✅ Default settings created');
    } else {
      logger.info('✅ Default settings already exist');
    }

    logger.info('✅ Database initialization complete');
  } catch (error) {
    logger.error('❌ Database initialization failed:', error instanceof Error ? { message: error.message, stack: error.stack } : { error });
    throw error;
  }
}
