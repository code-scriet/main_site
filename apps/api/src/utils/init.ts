import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { logger } from './logger.js';
import { generateSlug, generateUniqueSlug } from './slug.js';

const prisma = new PrismaClient();

export async function initializeDatabase() {
  try {
    logger.info('🔧 Initializing database...');

    // Fix failed migrations directly in the database
    try {
      logger.info('📊 Checking for failed migrations...');
      // Delete the failed migration record so migrate deploy can retry or skip it
      const deleted = await prisma.$executeRaw`
        DELETE FROM "_prisma_migrations" 
        WHERE migration_name = '20260220003000_harden_email_and_network_query_indexes'
        AND rolled_back_at IS NULL
        AND finished_at IS NULL
      `;
      if (deleted > 0) {
        logger.info('✅ Removed failed migration record');
      }
    } catch (migError) {
      logger.warn('⚠️ Migration cleanup warning', { error: migError instanceof Error ? migError.message : String(migError) });
    }

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
      select: { id: true },
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

/**
 * Generate slugs for announcements that don't have them
 * Run this during startup to handle existing data
 */
export async function populateAnnouncementSlugs() {
  try {
    // Find announcements without slugs (empty string)
    const announcementsWithoutSlugs = await prisma.announcement.findMany({
      where: { slug: '' },
      select: { id: true, title: true }
    });

    if (announcementsWithoutSlugs.length === 0) {
      return;
    }

    logger.info(`🔧 Generating slugs for ${announcementsWithoutSlugs.length} announcements...`);

    // Get all existing slugs (non-empty)
    const allAnnouncements = await prisma.announcement.findMany({
      select: { slug: true }
    });
    const existingSlugs = allAnnouncements
      .map(a => a.slug)
      .filter(slug => slug !== '');

    // Update each announcement with a unique slug
    for (const announcement of announcementsWithoutSlugs) {
      const baseSlug = generateSlug(announcement.title);
      const uniqueSlug = generateUniqueSlug(baseSlug, existingSlugs);
      
      await prisma.announcement.update({
        where: { id: announcement.id },
        data: { slug: uniqueSlug }
      });
      
      existingSlugs.push(uniqueSlug);
    }

    logger.info('✅ Announcement slugs populated');
  } catch (error) {
    logger.error('❌ Failed to populate announcement slugs:', error instanceof Error ? { message: error.message, stack: error.stack } : { error });
  }
}

const normalizeLegacySlugs = (legacySlugs: string[] | null | undefined, previousSlug: string | null | undefined, canonicalSlug: string): string[] => {
  const next = new Set((legacySlugs ?? []).filter(Boolean));
  const normalizedPrevious = previousSlug?.trim();
  if (normalizedPrevious && normalizedPrevious !== canonicalSlug) {
    next.add(normalizedPrevious);
  }
  next.delete(canonicalSlug);
  return Array.from(next);
};

export async function populateProfileSlugs() {
  try {
    const missingTeamSlugsBefore = await prisma.teamMember.count({
      where: {
        OR: [{ slug: null }, { slug: '' }],
      },
    });
    logger.info('🔎 Team slug normalization status', {
      stage: 'before',
      missingTeamSlugs: missingTeamSlugsBefore,
    });

    const teamMembers = await prisma.teamMember.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, slug: true, legacySlugs: true },
    });

    const usedTeamSlugs = new Set<string>();
    let updatedTeamCount = 0;

    for (const member of teamMembers) {
      const baseSlug = generateSlug(member.name) || 'team-member';
      const canonicalSlug = generateUniqueSlug(baseSlug, Array.from(usedTeamSlugs));
      usedTeamSlugs.add(canonicalSlug);

      const legacySlugs = normalizeLegacySlugs(member.legacySlugs, member.slug, canonicalSlug);
      const hasLegacyChanged = JSON.stringify(legacySlugs) !== JSON.stringify(member.legacySlugs ?? []);
      const hasCanonicalChanged = member.slug !== canonicalSlug;

      if (hasCanonicalChanged || hasLegacyChanged) {
        await prisma.teamMember.update({
          where: { id: member.id },
          data: { slug: canonicalSlug, legacySlugs },
        });
        updatedTeamCount += 1;
      }
    }

    const missingTeamSlugsAfter = await prisma.teamMember.count({
      where: {
        OR: [{ slug: null }, { slug: '' }],
      },
    });
    logger.info('🔎 Team slug normalization status', {
      stage: 'after',
      missingTeamSlugs: missingTeamSlugsAfter,
    });

    const networkProfiles = await prisma.networkProfile.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, fullName: true, slug: true, legacySlugs: true },
    });

    const usedNetworkSlugs = new Set<string>();
    let updatedNetworkCount = 0;

    for (const profile of networkProfiles) {
      const baseSlug = generateSlug(profile.fullName) || 'network-profile';
      const canonicalSlug = generateUniqueSlug(baseSlug, Array.from(usedNetworkSlugs));
      usedNetworkSlugs.add(canonicalSlug);

      const legacySlugs = normalizeLegacySlugs(profile.legacySlugs, profile.slug, canonicalSlug);
      const hasLegacyChanged = JSON.stringify(legacySlugs) !== JSON.stringify(profile.legacySlugs ?? []);
      const hasCanonicalChanged = profile.slug !== canonicalSlug;

      if (hasCanonicalChanged || hasLegacyChanged) {
        await prisma.networkProfile.update({
          where: { id: profile.id },
          data: { slug: canonicalSlug, legacySlugs },
        });
        updatedNetworkCount += 1;
      }
    }

    if (updatedTeamCount > 0 || updatedNetworkCount > 0) {
      logger.info('✅ Profile slugs normalized', {
        teamMembersUpdated: updatedTeamCount,
        networkProfilesUpdated: updatedNetworkCount,
      });
    }
  } catch (error) {
    logger.error('❌ Failed to normalize profile slugs:', error instanceof Error ? { message: error.message, stack: error.stack } : { error });
  }
}
