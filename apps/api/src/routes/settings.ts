import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';

export const settingsRouter = Router();

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
        announcementsEnabled: true,
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
          announcementsEnabled: true,
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
    } = req.body;

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
      },
    });

    await auditLog(authUser.id, 'UPDATE', 'settings', 'default', req.body);
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
    ];

    if (!allowedKeys.includes(key)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid setting key' } });
    }

    if (value === undefined) {
      return res.status(400).json({ success: false, error: { message: 'Value is required' } });
    }

    const settings = await prisma.settings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        [key]: value,
      },
      update: {
        [key]: value,
      },
    });

    await auditLog(authUser.id, 'UPDATE', 'settings', 'default', { [key]: value });
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
