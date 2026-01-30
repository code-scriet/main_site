import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        hiringEnabled: true,
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
      githubUrl,
      linkedinUrl,
      twitterUrl,
      instagramUrl,
      discordUrl,
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
        ...(hiringEnabled !== undefined && { hiringEnabled }),
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
        ...(githubUrl !== undefined && { githubUrl: githubUrl || null }),
        ...(linkedinUrl !== undefined && { linkedinUrl: linkedinUrl || null }),
        ...(twitterUrl !== undefined && { twitterUrl: twitterUrl || null }),
        ...(instagramUrl !== undefined && { instagramUrl: instagramUrl || null }),
        ...(discordUrl !== undefined && { discordUrl: discordUrl || null }),
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
      'hiringEnabled',
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

// Get email template configuration
settingsRouter.get('/email-templates', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const configPath = path.join(__dirname, '../config/email-templates.config.ts');
    const configContent = await fs.readFile(configPath, 'utf-8');
    
    // Parse the config file to extract values
    const welcomeBodyMatch = configContent.match(/welcomeBody:\s*'([^']*)'/s) || configContent.match(/welcomeBody:\s*"([^"]*)"/s);
    const announcementIntroMatch = configContent.match(/announcementIntro:\s*'([^']*)'/s) || configContent.match(/announcementIntro:\s*"([^"]*)"/s);
    const eventIntroMatch = configContent.match(/eventIntro:\s*'([^']*)'/s) || configContent.match(/eventIntro:\s*"([^"]*)"/s);
    const footerTextMatch = configContent.match(/footerText:\s*'([^']*)'/s) || configContent.match(/footerText:\s*"([^"]*)"/s);
    
    res.json({
      success: true,
      data: {
        emailWelcomeBody: welcomeBodyMatch ? welcomeBodyMatch[1] : '',
        emailAnnouncementBody: announcementIntroMatch ? announcementIntroMatch[1] : '',
        emailEventBody: eventIntroMatch ? eventIntroMatch[1] : '',
        emailFooterText: footerTextMatch ? footerTextMatch[1] : '',
      },
    });
  } catch (error) {
    console.error('Failed to read email templates:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to read email templates' } });
  }
});

// Update email template configuration
settingsRouter.patch('/email-templates', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { emailWelcomeBody, emailAnnouncementBody, emailEventBody, emailFooterText } = req.body;
    
    // Escape strings for TypeScript file
    const escape = (str: string = '') => str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
    
    const configContent = `// Email template customizations
// This file is auto-updated by the admin dashboard

export const emailTemplateConfig = {
  // Custom welcome email body (markdown supported)
  // Variables: {{name}}, {{clubName}}
  welcomeBody: '${escape(emailWelcomeBody || '')}',
  
  // Custom announcement email intro (markdown supported)
  announcementIntro: '${escape(emailAnnouncementBody || '')}',
  
  // Custom event email intro (markdown supported)
  eventIntro: '${escape(emailEventBody || '')}',
  
  // Custom footer text for all emails
  footerText: '${escape(emailFooterText || '')}',
};
`;
    
    const configPath = path.join(__dirname, '../config/email-templates.config.ts');
    await fs.writeFile(configPath, configContent, 'utf-8');
    
    await auditLog(authUser.id, 'UPDATE', 'email-templates', 'config', {
      updated: { emailWelcomeBody, emailAnnouncementBody, emailEventBody, emailFooterText },
    });
    
    res.json({
      success: true,
      data: { emailWelcomeBody, emailAnnouncementBody, emailEventBody, emailFooterText },
      message: 'Email templates updated successfully. Changes will take effect immediately.',
    });
  } catch (error) {
    console.error('Failed to update email templates:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to update email templates' } });
  }
});

