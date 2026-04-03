import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';
import { logger } from '../utils/logger.js';
import { invalidateEmailTemplateConfigCache, invalidateNotificationSettingsCache } from '../utils/email.js';
import { updateEventStatuses } from '../utils/eventStatus.js';

export const settingsRouter = Router();

const optionalUrl = z.union([z.string().url('Must be a valid URL'), z.literal(''), z.null()]).optional();

const updateSettingsSchema = z.object({
  clubName: z.string().trim().min(1).max(120).optional(),
  clubEmail: z.string().trim().email().optional(),
  clubDescription: z.string().trim().min(1).max(2000).optional(),
  registrationOpen: z.boolean().optional(),
  maxEventsPerUser: z.coerce.number().int().min(1).max(100).optional(),
  announcementsEnabled: z.boolean().optional(),
  showLeaderboard: z.boolean().optional(),
  showQOTD: z.boolean().optional(),
  showAchievements: z.boolean().optional(),
  show_tech_blogs: z.boolean().optional(),
  hiringEnabled: z.boolean().optional(),
  hiringTechnical: z.boolean().optional(),
  hiringDsaChamps: z.boolean().optional(),
  hiringDesigning: z.boolean().optional(),
  hiringSocialMedia: z.boolean().optional(),
  hiringManagement: z.boolean().optional(),
  showNetwork: z.boolean().optional(),
  mailingEnabled: z.boolean().optional(),
  certificatesEnabled: z.boolean().optional(),
  playgroundEnabled: z.boolean().optional(),
  playgroundDailyLimit: z.coerce.number().int().min(1).max(10000).optional(),
  competitionEnabled: z.boolean().optional(),
  // Email notification controls
  emailWelcomeEnabled: z.boolean().optional(),
  emailEventCreationEnabled: z.boolean().optional(),
  emailRegistrationEnabled: z.boolean().optional(),
  emailAnnouncementEnabled: z.boolean().optional(),
  emailCertificateEnabled: z.boolean().optional(),
  emailReminderEnabled: z.boolean().optional(),
  emailTestingMode: z.boolean().optional(),
  emailTestRecipients: z.string().max(2000).optional().nullable(),
  githubUrl: optionalUrl,
  linkedinUrl: optionalUrl,
  twitterUrl: optionalUrl,
  instagramUrl: optionalUrl,
  discordUrl: optionalUrl,
});

const updateEmailTemplatesSchema = z.object({
  emailWelcomeBody: z.string().max(20000).nullable().optional(),
  emailAnnouncementBody: z.string().max(20000).nullable().optional(),
  emailEventBody: z.string().max(20000).nullable().optional(),
  emailFooterText: z.string().max(5000).nullable().optional(),
});

// Get public settings (for frontend)
settingsRouter.get('/public', async (req: Request, res: Response) => {
  try {
    const settings = await prisma.settings.findFirst({
      where: { id: 'default' },
      select: {
        clubName: true,
        clubEmail: true,
        clubDescription: true,
        registrationOpen: true,
        showLeaderboard: true,
        showQOTD: true,
        showAchievements: true,
        show_tech_blogs: true,
        hiringEnabled: true,
        hiringTechnical: true,
        hiringDsaChamps: true,
        hiringDesigning: true,
        hiringSocialMedia: true,
        hiringManagement: true,
        showNetwork: true,
        mailingEnabled: true,
        certificatesEnabled: true,
        playgroundEnabled: true,
        playgroundDailyLimit: true,
        announcementsEnabled: true,
        competitionEnabled: true,
        githubUrl: true,
        linkedinUrl: true,
        twitterUrl: true,
        instagramUrl: true,
        discordUrl: true,
      },
    });

    if (!settings) {
      // Return default settings if none exist
      return res.json({
        success: true,
        data: {
          clubName: 'code.scriet',
          clubEmail: 'contact@codescriet.com',
          clubDescription: 'Building tomorrow\'s problem solvers through collaborative learning and hands-on coding experiences.',
          registrationOpen: true,
          showLeaderboard: false,
          showQOTD: true,
          showAchievements: true,
          show_tech_blogs: true,
          hiringEnabled: true,
          hiringTechnical: true,
          hiringDsaChamps: true,
          hiringDesigning: true,
          hiringSocialMedia: true,
          hiringManagement: true,
          showNetwork: true,
          mailingEnabled: true,
          certificatesEnabled: true,
          playgroundEnabled: true,
          playgroundDailyLimit: 100,
          announcementsEnabled: true,
          competitionEnabled: false,
          githubUrl: null,
          linkedinUrl: null,
          twitterUrl: null,
          instagramUrl: null,
          discordUrl: null,
        },
      });
    }

    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch settings' } });
  }
});

// Get all settings (admin only)
settingsRouter.get('/', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    let settings = await prisma.settings.findFirst({
      where: { id: 'default' },
    });

    if (!settings) {
      // Create default settings if none exist
      settings = await prisma.settings.create({
        data: { id: 'default' },
      });
    }

    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch settings' } });
  }
});

// Update settings
settingsRouter.put('/', authMiddleware, requireRole('PRESIDENT'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;

    // Only Super Admin or President can modify settings
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
    const isSuperAdmin = superAdminEmail && authUser.email === superAdminEmail;
    const isPresident = authUser.role === 'PRESIDENT';
    if (!isSuperAdmin && !isPresident) {
      return res.status(403).json({
        success: false,
        error: { message: 'Only the super admin or president can modify settings' },
      });
    }

    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { message: parsed.error.errors[0]?.message || 'Invalid settings payload' },
      });
    }

    const {
      clubName,
      clubEmail,
      clubDescription,
      registrationOpen,
      maxEventsPerUser,
      announcementsEnabled,
      showLeaderboard,
      showQOTD,
      showAchievements,
      show_tech_blogs,
      hiringEnabled,
      hiringTechnical,
      hiringDsaChamps,
      hiringDesigning,
      hiringSocialMedia,
      hiringManagement,
      showNetwork,
      mailingEnabled,
      certificatesEnabled,
      playgroundEnabled,
      playgroundDailyLimit,
      competitionEnabled,
      emailWelcomeEnabled,
      emailEventCreationEnabled,
      emailRegistrationEnabled,
      emailAnnouncementEnabled,
      emailCertificateEnabled,
      emailReminderEnabled,
      emailTestingMode,
      emailTestRecipients,
      githubUrl,
      linkedinUrl,
      twitterUrl,
      instagramUrl,
      discordUrl,
    } = parsed.data;

    const settingsData = {
      ...(clubName && { clubName }),
      ...(clubEmail && { clubEmail }),
      ...(clubDescription && { clubDescription }),
      ...(registrationOpen !== undefined && { registrationOpen }),
      ...(maxEventsPerUser !== undefined && { maxEventsPerUser }),
      ...(announcementsEnabled !== undefined && { announcementsEnabled }),
      ...(showLeaderboard !== undefined && { showLeaderboard }),
      ...(showQOTD !== undefined && { showQOTD }),
      ...(showAchievements !== undefined && { showAchievements }),
      ...(show_tech_blogs !== undefined && { show_tech_blogs }),
      ...(hiringEnabled !== undefined && { hiringEnabled }),
      ...(hiringTechnical !== undefined && { hiringTechnical }),
      ...(hiringDsaChamps !== undefined && { hiringDsaChamps }),
      ...(hiringDesigning !== undefined && { hiringDesigning }),
      ...(hiringSocialMedia !== undefined && { hiringSocialMedia }),
      ...(hiringManagement !== undefined && { hiringManagement }),
      ...(showNetwork !== undefined && { showNetwork }),
      ...(mailingEnabled !== undefined && { mailingEnabled }),
      ...(certificatesEnabled !== undefined && { certificatesEnabled }),
      ...(playgroundEnabled !== undefined && { playgroundEnabled }),
      ...(playgroundDailyLimit !== undefined && { playgroundDailyLimit }),
      ...(competitionEnabled !== undefined && { competitionEnabled }),
      ...(emailWelcomeEnabled !== undefined && { emailWelcomeEnabled }),
      ...(emailEventCreationEnabled !== undefined && { emailEventCreationEnabled }),
      ...(emailRegistrationEnabled !== undefined && { emailRegistrationEnabled }),
      ...(emailAnnouncementEnabled !== undefined && { emailAnnouncementEnabled }),
      ...(emailCertificateEnabled !== undefined && { emailCertificateEnabled }),
      ...(emailReminderEnabled !== undefined && { emailReminderEnabled }),
      ...(emailTestingMode !== undefined && { emailTestingMode }),
      ...(emailTestRecipients !== undefined && { emailTestRecipients: emailTestRecipients || null }),
      ...(githubUrl !== undefined && { githubUrl: githubUrl || null }),
      ...(linkedinUrl !== undefined && { linkedinUrl: linkedinUrl || null }),
      ...(twitterUrl !== undefined && { twitterUrl: twitterUrl || null }),
      ...(instagramUrl !== undefined && { instagramUrl: instagramUrl || null }),
      ...(discordUrl !== undefined && { discordUrl: discordUrl || null }),
    };

    const settings = await prisma.settings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        ...settingsData,
      },
      update: settingsData,
    });

    invalidateNotificationSettingsCache();
    await auditLog(authUser.id, 'UPDATE', 'settings', 'default', parsed.data);
    res.json({ success: true, data: settings, message: 'Settings updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to update settings' } });
  }
});

// Update email template configuration
// IMPORTANT: Must be registered BEFORE patch('/:key') otherwise the wildcard route captures it first
settingsRouter.patch('/email-templates', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;

    // Only Super Admin or President can update email templates
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
    if (authUser.email !== superAdminEmail && authUser.role !== 'PRESIDENT') {
      return res.status(403).json({
        success: false,
        error: { message: 'Only the super admin or president can update email templates' },
      });
    }

    const parsed = updateEmailTemplatesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { message: parsed.error.errors[0]?.message || 'Invalid email template payload' },
      });
    }

    const { emailWelcomeBody, emailAnnouncementBody, emailEventBody, emailFooterText } = parsed.data;

    const settings = await prisma.settings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        emailWelcomeBody: emailWelcomeBody || '',
        emailAnnouncementBody: emailAnnouncementBody || '',
        emailEventBody: emailEventBody || '',
        emailFooterText: emailFooterText || '',
      },
      update: {
        ...(emailWelcomeBody !== undefined && { emailWelcomeBody }),
        ...(emailAnnouncementBody !== undefined && { emailAnnouncementBody }),
        ...(emailEventBody !== undefined && { emailEventBody }),
        ...(emailFooterText !== undefined && { emailFooterText }),
      },
    });

    invalidateEmailTemplateConfigCache();

    await auditLog(authUser.id, 'UPDATE', 'email-templates', 'config', {
      updated: { emailWelcomeBody, emailAnnouncementBody, emailEventBody, emailFooterText },
    });

    res.json({
      success: true,
      data: {
        emailWelcomeBody: settings.emailWelcomeBody || '',
        emailAnnouncementBody: settings.emailAnnouncementBody || '',
        emailEventBody: settings.emailEventBody || '',
        emailFooterText: settings.emailFooterText || '',
      },
      message: 'Email templates updated successfully. Changes will take effect immediately.',
    });
  } catch (error) {
    logger.error('Failed to update email templates:', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: { message: 'Failed to update email templates' } });
  }
});

// Update specific setting
settingsRouter.patch('/:key', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;

    // Only Super Admin or President can modify settings
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
    const isSuperAdmin = superAdminEmail && authUser.email === superAdminEmail;
    const isPresident = authUser.role === 'PRESIDENT';
    if (!isSuperAdmin && !isPresident) {
      return res.status(403).json({
        success: false,
        error: { message: 'Only the super admin or president can modify settings' },
      });
    }

    const { key } = req.params;
    const { value } = req.body;

    const allowedKeys = [
      'clubName',
      'clubEmail',
      'clubDescription',
      'registrationOpen',
      'maxEventsPerUser',
      'announcementsEnabled',
      'showLeaderboard',
      'showQOTD',
      'showAchievements',
      'show_tech_blogs',
      'hiringEnabled',
      'hiringTechnical',
      'hiringDsaChamps',
      'hiringDesigning',
      'hiringSocialMedia',
      'hiringManagement',
      'showNetwork',
      'mailingEnabled',
      'certificatesEnabled',
      'playgroundEnabled',
      'playgroundDailyLimit',
      'competitionEnabled',
      'emailWelcomeEnabled',
      'emailEventCreationEnabled',
      'emailRegistrationEnabled',
      'emailAnnouncementEnabled',
      'emailCertificateEnabled',
      'emailReminderEnabled',
      'emailTestingMode',
      'emailTestRecipients',
      'githubUrl',
      'linkedinUrl',
      'twitterUrl',
      'instagramUrl',
      'discordUrl',
    ];

    if (!allowedKeys.includes(key)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid setting key' } });
    }

    if (value === undefined) {
      return res.status(400).json({ success: false, error: { message: 'Value is required' } });
    }

    const booleanKeys = new Set([
      'registrationOpen',
      'announcementsEnabled',
      'showLeaderboard',
      'showQOTD',
      'showAchievements',
      'show_tech_blogs',
      'hiringEnabled',
      'hiringTechnical',
      'hiringDsaChamps',
      'hiringDesigning',
      'hiringSocialMedia',
      'hiringManagement',
      'showNetwork',
      'mailingEnabled',
      'certificatesEnabled',
      'playgroundEnabled',
      'emailWelcomeEnabled',
      'emailEventCreationEnabled',
      'emailRegistrationEnabled',
      'emailAnnouncementEnabled',
      'emailCertificateEnabled',
      'emailReminderEnabled',
      'emailTestingMode',
    ]);
    const urlKeys = new Set([
      'githubUrl',
      'linkedinUrl',
      'twitterUrl',
      'instagramUrl',
      'discordUrl',
    ]);

    if (booleanKeys.has(key) && typeof value !== 'boolean') {
      return res.status(400).json({ success: false, error: { message: `${key} must be a boolean` } });
    }

    const parsedMaxEvents = key === 'maxEventsPerUser' ? Number(value) : undefined;
    const parsedPlaygroundDailyLimit = key === 'playgroundDailyLimit' ? Number(value) : undefined;
    if (
      key === 'maxEventsPerUser' &&
      (parsedMaxEvents === undefined ||
        !Number.isInteger(parsedMaxEvents) ||
        parsedMaxEvents < 1 ||
        parsedMaxEvents > 100)
    ) {
      return res.status(400).json({ success: false, error: { message: 'maxEventsPerUser must be an integer between 1 and 100' } });
    }

    if (
      key === 'playgroundDailyLimit' &&
      (parsedPlaygroundDailyLimit === undefined ||
        !Number.isInteger(parsedPlaygroundDailyLimit) ||
        parsedPlaygroundDailyLimit < 1 ||
        parsedPlaygroundDailyLimit > 10000)
    ) {
      return res.status(400).json({ success: false, error: { message: 'playgroundDailyLimit must be an integer between 1 and 10000' } });
    }

    if (key === 'emailTestRecipients') {
      if (value !== null && typeof value !== 'string') {
        return res.status(400).json({ success: false, error: { message: 'emailTestRecipients must be a string or null' } });
      }
      if (typeof value === 'string' && value.length > 2000) {
        return res.status(400).json({ success: false, error: { message: 'emailTestRecipients must be at most 2000 characters' } });
      }
    }

    if (urlKeys.has(key) && value !== null && typeof value !== 'string') {
      return res.status(400).json({ success: false, error: { message: `${key} must be a URL string or empty` } });
    }

    if (urlKeys.has(key) && typeof value === 'string' && value.trim() !== '') {
      try {
        const parsed = new URL(value);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return res.status(400).json({ success: false, error: { message: `${key} must be a valid URL` } });
        }
      } catch {
        return res.status(400).json({ success: false, error: { message: `${key} must be a valid URL` } });
      }
    }

    let normalizedValue: unknown =
      key === 'maxEventsPerUser'
        ? parsedMaxEvents
        : key === 'playgroundDailyLimit'
          ? parsedPlaygroundDailyLimit
          : value;
    if (
      ['githubUrl', 'linkedinUrl', 'twitterUrl', 'instagramUrl', 'discordUrl', 'emailTestRecipients'].includes(key) &&
      typeof value === 'string' &&
      value.trim() === ''
    ) {
      normalizedValue = null;
    }

    const settings = await prisma.settings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        [key]: normalizedValue,
      },
      update: {
        [key]: normalizedValue,
      },
    });

    invalidateNotificationSettingsCache();
    await auditLog(authUser.id, 'UPDATE', 'settings', 'default', { [key]: normalizedValue });
    res.json({ success: true, data: settings, message: `Setting ${key} updated successfully` });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to update setting' } });
  }
});

// Reset settings to default
settingsRouter.post('/reset', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;

    // Only Super Admin or President can reset settings
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
    if (authUser.email !== superAdminEmail && authUser.role !== 'PRESIDENT') {
      return res.status(403).json({
        success: false,
        error: { message: 'Only the super admin or president can reset settings' },
      });
    }

    await prisma.settings.delete({ where: { id: 'default' } }).catch(() => {});

    const settings = await prisma.settings.create({
      data: { id: 'default' },
    });

    await auditLog(authUser.id, 'UPDATE', 'settings', 'default', { action: 'reset' });
    res.json({ success: true, data: settings, message: 'Settings reset to defaults' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to reset settings' } });
  }
});

// Get email template configuration
settingsRouter.get('/email-templates', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: {
        emailWelcomeBody: true,
        emailAnnouncementBody: true,
        emailEventBody: true,
        emailFooterText: true,
      },
    });
    
    res.json({
      success: true,
      data: {
        emailWelcomeBody: settings?.emailWelcomeBody || '',
        emailAnnouncementBody: settings?.emailAnnouncementBody || '',
        emailEventBody: settings?.emailEventBody || '',
        emailFooterText: settings?.emailFooterText || '',
      },
    });
  } catch (error) {
    logger.error('Failed to read email templates:', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: { message: 'Failed to read email templates' } });
  }
});

// Trigger event status sync immediately (admin only)
settingsRouter.post('/event-status/sync-now', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;

    const summary = await updateEventStatuses();

    await auditLog(authUser.id, 'UPDATE', 'events', 'status-sync', {
      action: 'manual-status-sync',
      summary,
    });

    return res.json({
      success: true,
      data: summary,
      message: 'Event statuses synced successfully',
    });
  } catch (error) {
    logger.error('Failed to sync event statuses:', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ success: false, error: { message: 'Failed to sync event statuses' } });
  }
});
