import { prisma } from '../lib/prisma.js';
import { logger } from './logger.js';

/**
 * Field mapping from User to TeamMember.
 * Each entry maps a User field name to a TeamMember field name.
 */
const USER_TO_TEAM_FIELD_MAP: Record<string, string> = {
  bio: 'bio',
  githubUrl: 'github',
  linkedinUrl: 'linkedin',
  twitterUrl: 'twitter',
  websiteUrl: 'website',
};

/**
 * Syncs User profile data to the linked TeamMember record.
 *
 * Only writes to TeamMember fields that are currently null (i.e., not manually
 * overridden). TeamMember data always takes priority.
 *
 * This is fire-and-forget: errors are logged but never thrown, so the
 * caller's primary operation is never disrupted.
 */
export async function syncUserToTeamMember(userId: string): Promise<void> {
  try {
    // Find the linked TeamMember
    const teamMember = await prisma.teamMember.findUnique({
      where: { userId },
    });

    if (!teamMember) return; // No linked team member — nothing to sync

    // Get the User's current data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        bio: true,
        githubUrl: true,
        linkedinUrl: true,
        twitterUrl: true,
        websiteUrl: true,
      },
    });

    if (!user) return;

    // Build the update payload: only include fields that are null on TeamMember
    // and have a non-null value on User
    const updateData: Record<string, string> = {};

    for (const [userField, teamField] of Object.entries(USER_TO_TEAM_FIELD_MAP)) {
      const userValue = user[userField as keyof typeof user];
      const teamValue = teamMember[teamField as keyof typeof teamMember];

      if (teamValue === null && userValue) {
        updateData[teamField] = userValue;
      }
    }

    // Only run the update if there's something to sync
    if (Object.keys(updateData).length > 0) {
      await prisma.teamMember.update({
        where: { userId },
        data: updateData,
      });

      logger.info('Synced User data to TeamMember', {
        userId,
        teamMemberId: teamMember.id,
        syncedFields: Object.keys(updateData),
      });
    }
  } catch (error) {
    logger.error('Failed to sync User to TeamMember', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Syncs User profile data to the linked NetworkProfile record.
 *
 * Currently syncs `bio` only (other fields don't overlap meaningfully).
 * Same conservative approach: only writes to null NetworkProfile fields.
 */
export async function syncUserToNetworkProfile(userId: string): Promise<void> {
  try {
    const networkProfile = await prisma.networkProfile.findUnique({
      where: { userId },
    });

    if (!networkProfile) return; // No linked network profile

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { bio: true },
    });

    if (!user) return;

    // Sync bio if NetworkProfile bio is null and User bio exists
    if (networkProfile.bio === null && user.bio) {
      await prisma.networkProfile.update({
        where: { userId },
        data: { bio: user.bio },
      });

      logger.info('Synced User data to NetworkProfile', {
        userId,
        networkProfileId: networkProfile.id,
        syncedFields: ['bio'],
      });
    }
  } catch (error) {
    logger.error('Failed to sync User to NetworkProfile', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
