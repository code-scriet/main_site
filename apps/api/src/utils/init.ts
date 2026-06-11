import * as bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { logger } from './logger.js';
import { generateSlug, generateUniqueSlug } from './slug.js';

// Run an async worker over an array in fixed-size chunks. Each chunk runs
// sequentially so we don't blow past the Neon connection pool, but every
// item inside a chunk can run in parallel. Used by populateProfileSlugs to
// batch transactional writes instead of issuing one round-trip per row.
async function runInChunks<T>(items: T[], size: number, worker: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await worker(items.slice(i, i + size));
  }
}

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
    // This pass is a legacy backfill/repair: write paths (team.ts, network.ts)
    // maintain slugs on every create/update. When the cheap count probes show
    // nothing is missing, skip the full-table scans entirely — most boots pay
    // two COUNTs instead of hydrating every teamMember + networkProfile row.
    const [missingTeamSlugsBefore, missingNetworkSlugsBefore] = await Promise.all([
      prisma.teamMember.count({
        where: {
          OR: [{ slug: null }, { slug: '' }],
        },
      }),
      prisma.networkProfile.count({
        where: {
          OR: [{ slug: null }, { slug: '' }],
        },
      }),
    ]);
    logger.info('🔎 Profile slug normalization status', {
      stage: 'before',
      missingTeamSlugs: missingTeamSlugsBefore,
      missingNetworkSlugs: missingNetworkSlugsBefore,
    });

    let updatedTeamCount = 0;
    if (missingTeamSlugsBefore > 0) {
      const teamMembers = await prisma.teamMember.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true, slug: true, legacySlugs: true },
      });

      const usedTeamSlugs = new Set<string>();
      const teamUpdates: Array<{ id: string; slug: string; legacySlugs: string[] }> = [];

      for (const member of teamMembers) {
        const baseSlug = generateSlug(member.name) || 'team-member';
        const canonicalSlug = generateUniqueSlug(baseSlug, Array.from(usedTeamSlugs));
        usedTeamSlugs.add(canonicalSlug);

        const legacySlugs = normalizeLegacySlugs(member.legacySlugs, member.slug, canonicalSlug);
        const hasLegacyChanged = JSON.stringify(legacySlugs) !== JSON.stringify(member.legacySlugs ?? []);
        const hasCanonicalChanged = member.slug !== canonicalSlug;

        if (hasCanonicalChanged || hasLegacyChanged) {
          teamUpdates.push({ id: member.id, slug: canonicalSlug, legacySlugs });
        }
      }

      // Batched updates so cold-starts don't serialize one round-trip per row.
      if (teamUpdates.length > 0) {
        await runInChunks(teamUpdates, 50, (chunk) =>
          prisma.$transaction(
            chunk.map((u) =>
              prisma.teamMember.update({ where: { id: u.id }, data: { slug: u.slug, legacySlugs: u.legacySlugs } }),
            ),
          ),
        );
        updatedTeamCount = teamUpdates.length;
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
    }

    let updatedNetworkCount = 0;
    if (missingNetworkSlugsBefore > 0) {
      const networkProfiles = await prisma.networkProfile.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, fullName: true, slug: true, legacySlugs: true },
      });

      const usedNetworkSlugs = new Set<string>();
      const networkUpdates: Array<{ id: string; slug: string; legacySlugs: string[] }> = [];

      for (const profile of networkProfiles) {
        const baseSlug = generateSlug(profile.fullName) || 'network-profile';
        const canonicalSlug = generateUniqueSlug(baseSlug, Array.from(usedNetworkSlugs));
        usedNetworkSlugs.add(canonicalSlug);

        const legacySlugs = normalizeLegacySlugs(profile.legacySlugs, profile.slug, canonicalSlug);
        const hasLegacyChanged = JSON.stringify(legacySlugs) !== JSON.stringify(profile.legacySlugs ?? []);
        const hasCanonicalChanged = profile.slug !== canonicalSlug;

        if (hasCanonicalChanged || hasLegacyChanged) {
          networkUpdates.push({ id: profile.id, slug: canonicalSlug, legacySlugs });
        }
      }

      if (networkUpdates.length > 0) {
        await runInChunks(networkUpdates, 50, (chunk) =>
          prisma.$transaction(
            chunk.map((u) =>
              prisma.networkProfile.update({ where: { id: u.id }, data: { slug: u.slug, legacySlugs: u.legacySlugs } }),
            ),
          ),
        );
        updatedNetworkCount = networkUpdates.length;
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
