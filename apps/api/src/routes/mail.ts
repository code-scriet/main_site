import { Router, Request, Response } from 'express';
import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';
import { emailService, EmailTemplates } from '../utils/email.js';
import { logger } from '../utils/logger.js';

export const mailRouter = Router();

/**
 * Allow safe, rich HTML while stripping anything dangerous (XSS, scripts, iframes, etc.)
 * Suitable for trusted admin users composing email bodies.
 */
const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'strong', 'em', 'u', 's', 'del', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li',
  'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'div', 'span',
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  'a': ['href', 'title', 'target', 'rel'],
  'img': ['src', 'alt', 'width', 'height'],
  'th': ['colspan', 'rowspan'],
  'td': ['colspan', 'rowspan'],
  '*': ['class', 'style'],
};

const ALLOWED_SCHEMES = ['https', 'http', 'mailto'];

function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ALLOWED_SCHEMES,
    allowedSchemesByTag: {
      img: ['https', 'data'],
    },
    // Enforce rel="noopener noreferrer" on all links automatically
    transformTags: {
      'a': sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
    },
  });
}

const sendMailSchema = z.object({
  audience: z.enum(['all_users', 'all_network', 'specific']),
  emails: z.array(z.string().email()).optional(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(50000),
  bodyType: z.enum(['markdown', 'html']).default('markdown'),
});

// Search users / network for recipient picker
mailRouter.get('/recipients', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const type = (req.query.type as string) || 'users';

    if (type === 'network') {
      const profiles = await prisma.networkProfile.findMany({
        where: search ? {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' } },
            { user: { email: { contains: search, mode: 'insensitive' } } },
          ],
          status: 'VERIFIED',
        } : { status: 'VERIFIED' },
        select: {
          id: true,
          fullName: true,
          user: { select: { email: true } },
        },
        take: 20,
        orderBy: { fullName: 'asc' },
      });
      return res.json({
        success: true,
        data: profiles.map(p => ({ id: p.id, name: p.fullName, email: p.user.email })),
      });
    }

    const users = await prisma.user.findMany({
      where: search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      } : {},
      select: { id: true, name: true, email: true, role: true },
      take: 20,
      orderBy: { name: 'asc' },
    });

    return res.json({ success: true, data: users });
  } catch (error) {
    logger.error('Failed to search recipients', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to search recipients' } });
  }
});

// Send email (ADMIN + PRESIDENT only; Super Admin always allowed)
mailRouter.post('/send', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;

    // Check if mailing is enabled
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { mailingEnabled: true },
    });

    if (settings && settings.mailingEnabled === false) {
      return res.status(403).json({
        success: false,
        error: { message: 'Mailing system is currently disabled. Enable it in Settings.' },
      });
    }

    const parsed = sendMailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { message: parsed.error.errors[0]?.message || 'Invalid request' },
      });
    }

    const { audience, emails, subject, body, bodyType } = parsed.data;

    // Sanitize HTML bodies to prevent XSS or injected scripts in email clients
    let safeBody = body;
    if (bodyType === 'html') {
      safeBody = sanitizeEmailHtml(body);
    }

    let recipientEmails: string[] = [];

    if (audience === 'all_users') {
      const users = await prisma.user.findMany({ select: { email: true } });
      recipientEmails = users.map(u => u.email);
    } else if (audience === 'all_network') {
      const profiles = await prisma.networkProfile.findMany({
        where: { status: 'VERIFIED' },
        select: { user: { select: { email: true } } },
      });
      recipientEmails = profiles.map(p => p.user.email);
    } else if (audience === 'specific') {
      if (!emails || emails.length === 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'No recipients specified' },
        });
      }
      recipientEmails = emails;
    }

    if (recipientEmails.length === 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'No recipients found for this audience' },
      });
    }

    // Build email using the general-purpose admin template
    const template = EmailTemplates.adminMail(subject, safeBody, bodyType);

    const success = await emailService.sendBulk(
      recipientEmails,
      template.subject,
      template.html,
      template.text,
    );

    await auditLog(authUser.id, 'SEND_EMAIL', 'mail', undefined, {
      audience,
      recipientCount: recipientEmails.length,
      subject,
      bodyType,
    });

    if (success) {
      res.json({
        success: true,
        message: `Email sent to ${recipientEmails.length} recipient(s)`,
        data: { recipientCount: recipientEmails.length },
      });
    } else {
      res.status(500).json({
        success: false,
        error: { message: 'Failed to send some or all emails. Check server logs.' },
      });
    }
  } catch (error) {
    logger.error('Failed to send email', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to send email' } });
  }
});
