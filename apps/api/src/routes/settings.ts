import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';
import { logger } from '../utils/logger.js';
import { invalidateEmailTemplateConfigCache, invalidateNotificationSettingsCache } from '../utils/email.js';
import { invalidateSettingsCache, getCachedSettings } from '../utils/settingsCache.js';
import { updateEventStatuses } from '../utils/eventStatus.js';
import { hasRuntimeAttendanceJwtSecret, setRuntimeAttendanceJwtSecret } from '../utils/attendanceToken.js';

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
  problemsEnabled: z.boolean().optional(),
  // Email notification controls
  emailWelcomeEnabled: z.boolean().optional(),
  emailEventCreationEnabled: z.boolean().optional(),
  emailRegistrationEnabled: z.boolean().optional(),
  emailAnnouncementEnabled: z.boolean().optional(),
  emailCertificateEnabled: z.boolean().optional(),
  emailReminderEnabled: z.boolean().optional(),
  emailInvitationEnabled: z.boolean().optional(),
  emailTestingMode: z.boolean().optional(),
  emailTestRecipients: z.string().max(2000).optional().nullable(),
  githubUrl: optionalUrl,
  linkedinUrl: optionalUrl,
  twitterUrl: optionalUrl,
  instagramUrl: optionalUrl,
  discordUrl: optionalUrl,
  whatsappUrl: optionalUrl,
});

const updateEmailTemplatesSchema = z.object({
  emailWelcomeBody: z.string().max(20000).nullable().optional(),
  emailAnnouncementBody: z.string().max(20000).nullable().optional(),
  emailEventBody: z.string().max(20000).nullable().optional(),
  emailFooterText: z.string().max(5000).nullable().optional(),
});

const updateSecurityEnvSchema = z.object({
  attendanceJwtSecret: z.string().trim().min(16).max(512).nullable().optional(),
  indexNowKey: z.string().trim().min(8).max(128).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one security env value must be provided',
});

function isSuperAdminOrPresident(authUser: { email: string; role: string }): boolean {
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
  const isSuperAdmin = Boolean(superAdminEmail) && authUser.email === superAdminEmail;
  const isPresident = authUser.role === 'PRESIDENT';
  return isSuperAdmin || isPresident;
}

function enforceSuperAdminOrPresident(authUser: { email: string; role: string }, res: Response): boolean {
  if (!isSuperAdminOrPresident(authUser)) {
    res.status(403).json({
      success: false,
      error: { message: 'Only the super admin or president can access settings' },
    });
    return false;
  }

  return true;
}

function sanitizeSettingsForResponse<T extends Record<string, unknown>>(settings: T): Omit<T, 'attendanceJwtSecret' | 'indexNowKey'> {
  const {
    attendanceJwtSecret: _attendanceJwtSecret,
    indexNowKey: _indexNowKey,
    ...safeSettings
  } = settings as T & { attendanceJwtSecret?: unknown; indexNowKey?: unknown };

  return safeSettings as Omit<T, 'attendanceJwtSecret' | 'indexNowKey'>;
}

function buildSecurityEnvStatus(settings: {
  attendanceJwtSecret: string | null;
  indexNowKey: string | null;
  updatedAt: Date;
} | null) {
  const envAttendanceJwtSecret = process.env.ATTENDANCE_JWT_SECRET?.trim() || ''; // legacy only
  const envIndexNowKey = process.env.INDEXNOW_KEY?.trim() || ''; // legacy only
  const storedAttendanceJwtSecret = settings?.attendanceJwtSecret?.trim() || '';
  const storedIndexNowKey = settings?.indexNowKey?.trim() || '';
  const runtimeAttendanceJwtSecretActive = Boolean(storedAttendanceJwtSecret) || hasRuntimeAttendanceJwtSecret();
  const runtimeIndexNowKeyActive = Boolean(storedIndexNowKey) || Boolean(envIndexNowKey);

  return {
    attendanceJwtSecretConfigured: Boolean(storedAttendanceJwtSecret),
    indexNowKeyConfigured: Boolean(storedIndexNowKey),
    mode: 'settings-only' as const,
    runtimeStatus: {
      attendanceJwtSecretActive: runtimeAttendanceJwtSecretActive,
      indexNowKeyActive: runtimeIndexNowKeyActive,
      nodeEnv: process.env.NODE_ENV || 'development',
      legacyEnvDetected: {
        attendanceJwtSecret: Boolean(envAttendanceJwtSecret),
        indexNowKey: Boolean(envIndexNowKey),
      },
    },
    updatedAt: settings?.updatedAt?.toISOString() || null,
  };
}

async function supportsSecurityEnvPersistence(): Promise<boolean> {
  try {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'settings'
        AND column_name IN ('attendance_jwt_secret', 'indexnow_key')
    `;
    const available = new Set(columns.map((column) => column.column_name));
    return available.has('attendance_jwt_secret') && available.has('indexnow_key');
  } catch (error) {
    logger.warn('Failed to inspect settings table columns for security-env support', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function applyRuntimeSecurityEnvValues(options: {
  attendanceJwtSecret?: string | null;
  indexNowKey?: string | null;
}): void {
  const { attendanceJwtSecret, indexNowKey } = options;

  if (attendanceJwtSecret !== undefined) {
    setRuntimeAttendanceJwtSecret(attendanceJwtSecret);
    logger.info('Updated runtime attendance secret from settings', {
      source: 'settings',
      configured: Boolean(attendanceJwtSecret),
    });
  }

  if (indexNowKey !== undefined) {
    if (indexNowKey) {
      process.env.INDEXNOW_KEY = indexNowKey;
    } else {
      delete process.env.INDEXNOW_KEY;
    }

    logger.info('Updated runtime IndexNow key from settings', {
      source: 'settings',
      configured: Boolean(indexNowKey),
    });
  }
}

// Get public settings (for frontend)
settingsRouter.get('/public', async (req: Request, res: Response) => {
  try {
    const full = await getCachedSettings();
    // Project to the public-safe shape. Read once from cache, then pick fields —
    // every dashboard page load hits this endpoint, so the cache hit is hot.
    const settings = full && {
      clubName: full.clubName,
      clubEmail: full.clubEmail,
      clubDescription: full.clubDescription,
      registrationOpen: full.registrationOpen,
      showLeaderboard: full.showLeaderboard,
      showQOTD: full.showQOTD,
      showAchievements: full.showAchievements,
      show_tech_blogs: full.show_tech_blogs,
      hiringEnabled: full.hiringEnabled,
      hiringTechnical: full.hiringTechnical,
      hiringDsaChamps: full.hiringDsaChamps,
      hiringDesigning: full.hiringDesigning,
      hiringSocialMedia: full.hiringSocialMedia,
      hiringManagement: full.hiringManagement,
      showNetwork: full.showNetwork,
      mailingEnabled: full.mailingEnabled,
      certificatesEnabled: full.certificatesEnabled,
      playgroundEnabled: full.playgroundEnabled,
      playgroundDailyLimit: full.playgroundDailyLimit,
      announcementsEnabled: full.announcementsEnabled,
      competitionEnabled: full.competitionEnabled,
      problemsEnabled: full.problemsEnabled,
      githubUrl: full.githubUrl,
      linkedinUrl: full.linkedinUrl,
      twitterUrl: full.twitterUrl,
      instagramUrl: full.instagramUrl,
      discordUrl: full.discordUrl,
      whatsappUrl: full.whatsappUrl,
      accentColor: full.accentColor,
    };

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
          problemsEnabled: false,
          githubUrl: null,
          linkedinUrl: null,
          twitterUrl: null,
          instagramUrl: null,
          discordUrl: null,
          whatsappUrl: null,
          accentColor: 'rust',
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
    const authUser = getAuthUser(req)!;
    if (!enforceSuperAdminOrPresident(authUser, res)) {
      return;
    }

    let settings = await prisma.settings.findFirst({
      where: { id: 'default' },
    });

    if (!settings) {
      // Create default settings if none exist
      settings = await prisma.settings.create({
        data: { id: 'default' },
      });
    }

    res.json({ success: true, data: sanitizeSettingsForResponse(settings) });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch settings' } });
  }
});

// Update settings
settingsRouter.put('/', authMiddleware, requireRole('PRESIDENT'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;

    if (!enforceSuperAdminOrPresident(authUser, res)) {
      return;
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
      problemsEnabled,
      emailWelcomeEnabled,
      emailEventCreationEnabled,
      emailRegistrationEnabled,
      emailAnnouncementEnabled,
      emailCertificateEnabled,
      emailReminderEnabled,
      emailInvitationEnabled,
      emailTestingMode,
      emailTestRecipients,
      githubUrl,
      linkedinUrl,
      twitterUrl,
      instagramUrl,
      discordUrl,
      whatsappUrl,
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
      ...(problemsEnabled !== undefined && { problemsEnabled }),
      ...(emailWelcomeEnabled !== undefined && { emailWelcomeEnabled }),
      ...(emailEventCreationEnabled !== undefined && { emailEventCreationEnabled }),
      ...(emailRegistrationEnabled !== undefined && { emailRegistrationEnabled }),
      ...(emailAnnouncementEnabled !== undefined && { emailAnnouncementEnabled }),
      ...(emailCertificateEnabled !== undefined && { emailCertificateEnabled }),
      ...(emailReminderEnabled !== undefined && { emailReminderEnabled }),
      ...(emailInvitationEnabled !== undefined && { emailInvitationEnabled }),
      ...(emailTestingMode !== undefined && { emailTestingMode }),
      ...(emailTestRecipients !== undefined && { emailTestRecipients: emailTestRecipients || null }),
      ...(githubUrl !== undefined && { githubUrl: githubUrl || null }),
      ...(linkedinUrl !== undefined && { linkedinUrl: linkedinUrl || null }),
      ...(twitterUrl !== undefined && { twitterUrl: twitterUrl || null }),
      ...(instagramUrl !== undefined && { instagramUrl: instagramUrl || null }),
      ...(discordUrl !== undefined && { discordUrl: discordUrl || null }),
      ...(whatsappUrl !== undefined && { whatsappUrl: whatsappUrl || null }),
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
    invalidateSettingsCache();
    await auditLog(authUser.id, 'UPDATE', 'settings', 'default', parsed.data);
    res.json({ success: true, data: sanitizeSettingsForResponse(settings), message: 'Settings updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to update settings' } });
  }
});

// Update email template configuration
// IMPORTANT: Must be registered BEFORE patch('/:key') otherwise the wildcard route captures it first
settingsRouter.patch('/email-templates', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;

    if (!enforceSuperAdminOrPresident(authUser, res)) {
      return;
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
    invalidateSettingsCache();

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

// Get and verify security env configuration (super admin / president only)
settingsRouter.get('/security-env', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    if (!enforceSuperAdminOrPresident(authUser, res)) {
      return;
    }

    const persistenceSupported = await supportsSecurityEnvPersistence();
    if (!persistenceSupported) {
      return res.json({
        success: true,
        data: {
          ...buildSecurityEnvStatus(null),
          persistenceSupported: false,
          runtimeOnlyMode: true,
        },
      });
    }

    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: {
        attendanceJwtSecret: true,
        indexNowKey: true,
        updatedAt: true,
      },
    });

    res.json({
      success: true,
      data: {
        ...buildSecurityEnvStatus(settings),
        persistenceSupported: true,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022') {
      return res.json({
        success: true,
        data: {
          ...buildSecurityEnvStatus(null),
          persistenceSupported: false,
          runtimeOnlyMode: true,
        },
      });
    }

    res.status(500).json({ success: false, error: { message: 'Failed to verify security env configuration' } });
  }
});

// Save security env reference values in settings (super admin / president only)
settingsRouter.patch('/security-env', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    if (!enforceSuperAdminOrPresident(authUser, res)) {
      return;
    }

    const parsed = updateSecurityEnvSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { message: parsed.error.errors[0]?.message || 'Invalid security env payload' },
      });
    }

    const attendanceJwtSecret = parsed.data.attendanceJwtSecret === undefined
      ? undefined
      : (parsed.data.attendanceJwtSecret?.trim() || null);
    const indexNowKey = parsed.data.indexNowKey === undefined
      ? undefined
      : (parsed.data.indexNowKey?.trim() || null);

    const updatedFields: string[] = [];
    if (attendanceJwtSecret !== undefined) updatedFields.push('attendanceJwtSecret');
    if (indexNowKey !== undefined) updatedFields.push('indexNowKey');

    const persistenceSupported = await supportsSecurityEnvPersistence();
    if (!persistenceSupported) {
      applyRuntimeSecurityEnvValues({ attendanceJwtSecret, indexNowKey });

      await auditLog(authUser.id, 'UPDATE', 'settings', 'security-env', {
        updatedFields,
        persistence: 'runtime-only',
      });

      return res.json({
        success: true,
        data: {
          ...buildSecurityEnvStatus(null),
          persistenceSupported: false,
          runtimeOnlyApplied: true,
        },
        message: 'Security env values applied for current runtime. Apply database migrations to persist them.',
      });
    }

    const settings = await prisma.settings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        ...(attendanceJwtSecret !== undefined && { attendanceJwtSecret }),
        ...(indexNowKey !== undefined && { indexNowKey }),
      },
      update: {
        ...(attendanceJwtSecret !== undefined && { attendanceJwtSecret }),
        ...(indexNowKey !== undefined && { indexNowKey }),
      },
      select: {
        attendanceJwtSecret: true,
        indexNowKey: true,
        updatedAt: true,
      },
    });

    invalidateSettingsCache();
    await auditLog(authUser.id, 'UPDATE', 'settings', 'security-env', {
      updatedFields,
    });

    applyRuntimeSecurityEnvValues({ attendanceJwtSecret, indexNowKey });

    res.json({
      success: true,
      data: {
        ...buildSecurityEnvStatus(settings),
        persistenceSupported: true,
      },
      message: 'Security env references updated successfully',
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022') {
      return res.status(409).json({
        success: false,
        error: { message: 'Security env columns are missing in database. Apply migrations, then retry.' },
      });
    }

    res.status(500).json({ success: false, error: { message: 'Failed to update security env configuration' } });
  }
});

// Update specific setting
settingsRouter.patch('/:key', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;

    if (!enforceSuperAdminOrPresident(authUser, res)) {
      return;
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
      'problemsEnabled',
      'emailWelcomeEnabled',
      'emailEventCreationEnabled',
      'emailRegistrationEnabled',
      'emailAnnouncementEnabled',
      'emailCertificateEnabled',
      'emailReminderEnabled',
      'emailInvitationEnabled',
      'emailTestingMode',
      'emailTestRecipients',
      'githubUrl',
      'linkedinUrl',
      'twitterUrl',
      'instagramUrl',
      'discordUrl',
      'whatsappUrl',
      'accentColor',
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
      'emailInvitationEnabled',
      'emailTestingMode',
    ]);
    const urlKeys = new Set([
      'githubUrl',
      'linkedinUrl',
      'twitterUrl',
      'instagramUrl',
      'discordUrl',
      'whatsappUrl',
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

    if (key === 'accentColor') {
      const allowedAccents = ['rust', 'teal', 'indigo', 'violet', 'mint', 'mono'];
      if (typeof value !== 'string' || !allowedAccents.includes(value)) {
        return res.status(400).json({
          success: false,
          error: { message: `accentColor must be one of: ${allowedAccents.join(', ')}` },
        });
      }
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
    invalidateSettingsCache();
    await auditLog(authUser.id, 'UPDATE', 'settings', 'default', { [key]: normalizedValue });
    res.json({ success: true, data: sanitizeSettingsForResponse(settings), message: `Setting ${key} updated successfully` });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to update setting' } });
  }
});

// Reset settings to default
settingsRouter.post('/reset', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;

    if (!enforceSuperAdminOrPresident(authUser, res)) {
      return;
    }

    await prisma.settings.delete({ where: { id: 'default' } }).catch(() => {});

    const settings = await prisma.settings.create({
      data: { id: 'default' },
    });

    // Reset blows away every cached setting field — invalidate every settings
    // cache so the next reader (email, feature gates) doesn't keep serving the
    // pre-reset values for 5 minutes.
    invalidateNotificationSettingsCache();
    invalidateEmailTemplateConfigCache();
    invalidateSettingsCache();

    await auditLog(authUser.id, 'UPDATE', 'settings', 'default', { action: 'reset' });
    res.json({ success: true, data: sanitizeSettingsForResponse(settings), message: 'Settings reset to defaults' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to reset settings' } });
  }
});

// Get email template configuration
settingsRouter.get('/email-templates', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    if (!enforceSuperAdminOrPresident(authUser, res)) {
      return;
    }

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
