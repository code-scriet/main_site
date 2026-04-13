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
  cc: z.array(z.string().email()).max(50).optional(),
  bcc: z.array(z.string().email()).max(50).optional(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(50000),
  bodyType: z.enum(['markdown', 'html']).default('markdown'),
});

const MAIL_AUDIENCE_BATCH_SIZE = 500;

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

    const { audience, emails, cc, bcc, subject, body, bodyType } = parsed.data;

    // Sanitize HTML bodies to prevent XSS or injected scripts in email clients
    let safeBody = body;
    if (bodyType === 'html') {
      safeBody = sanitizeEmailHtml(body);
    }
    const template = EmailTemplates.adminMail(subject, safeBody, bodyType);

    let recipientEmails: string[] = [];
    let recipientCount = 0;
    let bulkAudienceSuccess = true;

    if (audience === 'all_users') {
      let cursor: string | undefined;

      while (true) {
        const users = await prisma.user.findMany({
          where: {
            email: { not: '' },
            role: { not: 'NETWORK' },
          },
          select: { id: true, email: true },
          orderBy: { id: 'asc' },
          take: MAIL_AUDIENCE_BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });

        if (users.length === 0) {
          break;
        }

        cursor = users[users.length - 1].id;

        const batchEmails = Array.from(
          new Set(users.map((user) => user.email.trim().toLowerCase()).filter(Boolean)),
        );

        if (batchEmails.length > 0) {
          recipientCount += batchEmails.length;
          const sent = await emailService.sendBulk(
            batchEmails,
            template.subject,
            template.html,
            template.text,
            'admin_mail',
          );
          if (!sent) {
            bulkAudienceSuccess = false;
          }
        }

        if (users.length < MAIL_AUDIENCE_BATCH_SIZE) {
          break;
        }
      }
    } else if (audience === 'all_network') {
      let cursor: string | undefined;

      while (true) {
        const profiles = await prisma.networkProfile.findMany({
          where: {
            status: 'VERIFIED',
            user: {
              email: { not: '' },
            },
          },
          select: { id: true, user: { select: { email: true } } },
          orderBy: { id: 'asc' },
          take: MAIL_AUDIENCE_BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });

        if (profiles.length === 0) {
          break;
        }

        cursor = profiles[profiles.length - 1].id;

        const batchEmails = Array.from(
          new Set(profiles.map((profile) => profile.user.email.trim().toLowerCase()).filter(Boolean)),
        );

        if (batchEmails.length > 0) {
          recipientCount += batchEmails.length;
          const sent = await emailService.sendBulk(
            batchEmails,
            template.subject,
            template.html,
            template.text,
            'admin_mail',
          );
          if (!sent) {
            bulkAudienceSuccess = false;
          }
        }

        if (profiles.length < MAIL_AUDIENCE_BATCH_SIZE) {
          break;
        }
      }
    } else if (audience === 'specific') {
      if (!emails || emails.length === 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'No recipients specified' },
        });
      }
      // Accept external recipients for admin mail while preventing duplicate sends.
      const seen = new Set<string>();
      recipientEmails = [];
      for (const email of emails) {
        const normalized = email.trim();
        const key = normalized.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        recipientEmails.push(normalized);
      }
      recipientCount = recipientEmails.length;
    }

    if (recipientCount === 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'No recipients found for this audience' },
      });
    }

    const hasCcBcc = (cc && cc.length > 0) || (bcc && bcc.length > 0);
    let success: boolean;

    if (audience === 'specific') {
      if (hasCcBcc) {
        // For specific recipients with CC/BCC, use send() so TO/CC/BCC headers are correct
        success = await emailService.send({
          to: recipientEmails,
          cc: cc && cc.length > 0 ? cc : undefined,
          bcc: bcc && bcc.length > 0 ? bcc : undefined,
          subject: template.subject,
          html: template.html,
          text: template.text,
          category: 'admin_mail',
        });
      } else {
        success = await emailService.sendBulk(
          recipientEmails,
          template.subject,
          template.html,
          template.text,
          'admin_mail',
        );
      }
    } else {
      success = bulkAudienceSuccess;

      // For bulk audiences, send a separate copy to CC/BCC recipients
      if (hasCcBcc && success) {
        await emailService.send({
          to: authUser.email,
          cc: cc && cc.length > 0 ? cc : undefined,
          bcc: bcc && bcc.length > 0 ? bcc : undefined,
          subject: template.subject,
          html: template.html,
          text: template.text,
          category: 'admin_mail',
        });
      }
    }

    await auditLog(authUser.id, 'SEND_EMAIL', 'mail', undefined, {
      audience,
      recipientCount,
      ccCount: cc?.length || 0,
      bccCount: bcc?.length || 0,
      subject,
      bodyType,
    });

    if (success) {
      const ccBccSuffix = [
        cc?.length ? `${cc.length} CC` : '',
        bcc?.length ? `${bcc.length} BCC` : '',
      ].filter(Boolean).join(', ');

      res.json({
        success: true,
        message: `Email sent to ${recipientCount} recipient(s)${ccBccSuffix ? ` + ${ccBccSuffix}` : ''}`,
        data: { recipientCount, ccCount: cc?.length || 0, bccCount: bcc?.length || 0 },
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
