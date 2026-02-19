import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';
import { logger } from '../utils/logger.js';
import { invalidateEmailTemplateConfigCache } from '../utils/email.js';

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
  hiringEnabled: z.boolean().optional(),
  showNetwork: z.boolean().optional(),
  githubUrl: optionalUrl,
  linkedinUrl: optionalUrl,
  twitterUrl: optionalUrl,
  instagramUrl: optionalUrl,
  discordUrl: optionalUrl,
});

const updateEmailTemplatesSchema = z.object({
  emailWelcomeBody: z.string().max(20000).optional(),
  emailAnnouncementBody: z.string().max(20000).optional(),
  emailEventBody: z.string().max(20000).optional(),
  emailFooterText: z.string().max(5000).optional(),
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
        hiringEnabled: true,
        showNetwork: true,
        announcementsEnabled: true,
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
          hiringEnabled: true,
          showNetwork: true,
          announcementsEnabled: true,
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
settingsRouter.put('/', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
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
      hiringEnabled,
      showNetwork,
      githubUrl,
      linkedinUrl,
      twitterUrl,
      instagramUrl,
      discordUrl,
    } = parsed.data;

    const settings = await prisma.settings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        ...(clubName && { clubName }),
        ...(clubEmail && { clubEmail }),
        ...(clubDescription && { clubDescription }),
        ...(registrationOpen !== undefined && { registrationOpen }),
        ...(maxEventsPerUser !== undefined && { maxEventsPerUser }),
        ...(announcementsEnabled !== undefined && { announcementsEnabled }),
        ...(showLeaderboard !== undefined && { showLeaderboard }),
        ...(showQOTD !== undefined && { showQOTD }),
        ...(showAchievements !== undefined && { showAchievements }),
        ...(hiringEnabled !== undefined && { hiringEnabled }),
        ...(showNetwork !== undefined && { showNetwork }),
        ...(githubUrl !== undefined && { githubUrl: githubUrl || null }),
        ...(linkedinUrl !== undefined && { linkedinUrl: linkedinUrl || null }),
        ...(twitterUrl !== undefined && { twitterUrl: twitterUrl || null }),
        ...(instagramUrl !== undefined && { instagramUrl: instagramUrl || null }),
        ...(discordUrl !== undefined && { discordUrl: discordUrl || null }),
      },
      update: {
        ...(clubName && { clubName }),
        ...(clubEmail && { clubEmail }),
        ...(clubDescription && { clubDescription }),
        ...(registrationOpen !== undefined && { registrationOpen }),
        ...(maxEventsPerUser !== undefined && { maxEventsPerUser }),
        ...(announcementsEnabled !== undefined && { announcementsEnabled }),
        ...(showLeaderboard !== undefined && { showLeaderboard }),
        ...(showQOTD !== undefined && { showQOTD }),
        ...(showAchievements !== undefined && { showAchievements }),
        ...(hiringEnabled !== undefined && { hiringEnabled }),
        ...(showNetwork !== undefined && { showNetwork }),
        ...(githubUrl !== undefined && { githubUrl: githubUrl || null }),
        ...(linkedinUrl !== undefined && { linkedinUrl: linkedinUrl || null }),
        ...(twitterUrl !== undefined && { twitterUrl: twitterUrl || null }),
        ...(instagramUrl !== undefined && { instagramUrl: instagramUrl || null }),
        ...(discordUrl !== undefined && { discordUrl: discordUrl || null }),
      },
    });

    await auditLog(authUser.id, 'UPDATE', 'settings', 'default', parsed.data);
    res.json({ success: true, data: settings, message: 'Settings updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to update settings' } });
  }
});

// Update specific setting
settingsRouter.patch('/:key', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
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
      'hiringEnabled',
      'showNetwork',
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
      'hiringEnabled',
      'showNetwork',
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
    if (
      key === 'maxEventsPerUser' &&
      (parsedMaxEvents === undefined ||
        !Number.isInteger(parsedMaxEvents) ||
        parsedMaxEvents < 1 ||
        parsedMaxEvents > 100)
    ) {
      return res.status(400).json({ success: false, error: { message: 'maxEventsPerUser must be an integer between 1 and 100' } });
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

    let normalizedValue: unknown = key === 'maxEventsPerUser' ? parsedMaxEvents : value;
    if (
      ['githubUrl', 'linkedinUrl', 'twitterUrl', 'instagramUrl', 'discordUrl'].includes(key) &&
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

// Update email template configuration
settingsRouter.patch('/email-templates', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
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
