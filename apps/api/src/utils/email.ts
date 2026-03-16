// Email service for notifications using Brevo (formerly Sendinblue)
// Professional email notifications for code.scriet - The Coding Club

import { marked } from 'marked';
import { logger } from './logger.js';
import { prisma } from '../lib/prisma.js';
import QRCode from 'qrcode';

// ============================================
// Email Category & Notification Settings
// ============================================

export type EmailCategory =
  | 'welcome'
  | 'event_creation'
  | 'registration'
  | 'announcement'
  | 'certificate'
  | 'reminder'
  | 'admin_mail'
  | 'other';

interface NotificationSettings {
  emailWelcomeEnabled: boolean;
  emailEventCreationEnabled: boolean;
  emailRegistrationEnabled: boolean;
  emailAnnouncementEnabled: boolean;
  emailCertificateEnabled: boolean;
  emailReminderEnabled: boolean;
  mailingEnabled: boolean;
  emailTestingMode: boolean;
  emailTestRecipients: string | null;
}

const CATEGORY_TOGGLE_MAP: Record<EmailCategory, keyof NotificationSettings | null> = {
  welcome: 'emailWelcomeEnabled',
  event_creation: 'emailEventCreationEnabled',
  registration: 'emailRegistrationEnabled',
  announcement: 'emailAnnouncementEnabled',
  certificate: 'emailCertificateEnabled',
  reminder: 'emailReminderEnabled',
  admin_mail: 'mailingEnabled',
  other: null,
};

let notificationSettingsCache: NotificationSettings | null = null;
let lastNotificationFetch = 0;
const NOTIFICATION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function invalidateNotificationSettingsCache(): void {
  notificationSettingsCache = null;
  lastNotificationFetch = 0;
}

const ALL_ENABLED_DEFAULTS: NotificationSettings = {
  emailWelcomeEnabled: true,
  emailEventCreationEnabled: true,
  emailRegistrationEnabled: true,
  emailAnnouncementEnabled: true,
  emailCertificateEnabled: true,
  emailReminderEnabled: true,
  mailingEnabled: true,
  emailTestingMode: false,
  emailTestRecipients: null,
};

async function getNotificationSettings(): Promise<NotificationSettings> {
  const now = Date.now();
  if (notificationSettingsCache && (now - lastNotificationFetch) < NOTIFICATION_CACHE_TTL) {
    return notificationSettingsCache;
  }

  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: {
        emailWelcomeEnabled: true,
        emailEventCreationEnabled: true,
        emailRegistrationEnabled: true,
        emailAnnouncementEnabled: true,
        emailCertificateEnabled: true,
        emailReminderEnabled: true,
        mailingEnabled: true,
        emailTestingMode: true,
        emailTestRecipients: true,
      },
    });

    notificationSettingsCache = {
      emailWelcomeEnabled: settings?.emailWelcomeEnabled ?? true,
      emailEventCreationEnabled: settings?.emailEventCreationEnabled ?? true,
      emailRegistrationEnabled: settings?.emailRegistrationEnabled ?? true,
      emailAnnouncementEnabled: settings?.emailAnnouncementEnabled ?? true,
      emailCertificateEnabled: settings?.emailCertificateEnabled ?? true,
      emailReminderEnabled: settings?.emailReminderEnabled ?? true,
      mailingEnabled: settings?.mailingEnabled ?? true,
      emailTestingMode: settings?.emailTestingMode ?? false,
      emailTestRecipients: settings?.emailTestRecipients ?? null,
    };
    lastNotificationFetch = now;
    return notificationSettingsCache;
  } catch (error) {
    logger.error('Failed to fetch notification settings', {
      error: error instanceof Error ? error.message : String(error),
    });
    if (notificationSettingsCache) return notificationSettingsCache;
    return ALL_ENABLED_DEFAULTS;
  }
}

// ============================================
// Email template config cache
// ============================================

// Email template config cache
interface EmailTemplateConfig {
  welcomeBody: string;
  announcementIntro: string;
  eventIntro: string;
  footerText: string;
}

let emailTemplateConfigCache: EmailTemplateConfig | null = null;
let lastConfigFetch = 0;
const CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function invalidateEmailTemplateConfigCache(): void {
  emailTemplateConfigCache = null;
  lastConfigFetch = 0;
}

async function getEmailTemplateConfig(): Promise<EmailTemplateConfig> {
  const now = Date.now();
  if (emailTemplateConfigCache && (now - lastConfigFetch) < CONFIG_CACHE_TTL) {
    return emailTemplateConfigCache;
  }
  
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
    
    emailTemplateConfigCache = {
      welcomeBody: settings?.emailWelcomeBody || '',
      announcementIntro: settings?.emailAnnouncementBody || '',
      eventIntro: settings?.emailEventBody || '',
      footerText: settings?.emailFooterText || '',
    };
    lastConfigFetch = now;
    return emailTemplateConfigCache;
  } catch (error) {
    logger.error('Failed to fetch email template config from database', {
      error: error instanceof Error ? error.message : String(error)
    });
    // If we have stale cache, keep using it rather than returning empty defaults
    if (emailTemplateConfigCache) {
      return emailTemplateConfigCache;
    }
    // Return empty defaults only when no cache exists at all
    return {
      welcomeBody: '',
      announcementIntro: '',
      eventIntro: '',
      footerText: '',
    };
  }
}

// Brevo API configuration
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'code.scriet@codescriet.dev';
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'code.scriet';
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || 'tech_admin@codescriet.dev';

// Production URL for all email links
const SITE_URL = (process.env.FRONTEND_URL || 'https://codescriet.dev').replace(/\/+$/, '');

// Configure marked for email-safe HTML
marked.setOptions({
  breaks: true,
  gfm: true,
});

interface EmailAttachment {
  content: string; // raw base64 (no data URI prefix)
  name: string;
}

interface EmailOptions {
  to: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
  category?: EmailCategory;
}

interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}

interface BrevoRecipient {
  email: string;
  name?: string;
}

// ============================================
// Markdown to Email HTML Converter
// ============================================

function markdownToEmailHtml(markdown: string): string {
  const rawHtml = marked.parse(markdown, { async: false }) as string;

  return rawHtml
    .replace(/<p>/g, '<p style="margin: 0 0 16px 0; font-size: 15px; color: #d1d5db; line-height: 1.7;">')
    .replace(/<h1>/g, '<h1 style="margin: 24px 0 12px 0; font-size: 24px; font-weight: 700; color: #f9fafb;">')
    .replace(/<h2>/g, '<h2 style="margin: 20px 0 10px 0; font-size: 20px; font-weight: 600; color: #f9fafb;">')
    .replace(/<h3>/g, '<h3 style="margin: 16px 0 8px 0; font-size: 18px; font-weight: 600; color: #f9fafb;">')
    .replace(/<ul>/g, '<ul style="margin: 0 0 16px 0; padding-left: 20px; color: #d1d5db;">')
    .replace(/<ol>/g, '<ol style="margin: 0 0 16px 0; padding-left: 20px; color: #d1d5db;">')
    .replace(/<li>/g, '<li style="margin: 6px 0; line-height: 1.6;">')
    .replace(/<a /g, '<a style="color: #fbbf24; text-decoration: underline;" ')
    .replace(/<strong>/g, '<strong style="color: #f9fafb; font-weight: 600;">')
    .replace(/<em>/g, '<em style="color: #e5e7eb;">')
    .replace(/<pre>/g, '<pre style="margin: 16px 0; padding: 16px; background-color: #111827; border-radius: 8px; overflow-x: auto; border: 1px solid #374151;">')
    .replace(/<code>/g, '<code style="font-family: \'JetBrains Mono\', \'Fira Code\', monospace; font-size: 13px; color: #34d399;">')
    .replace(/<blockquote>/g, '<blockquote style="margin: 16px 0; padding: 12px 20px; border-left: 4px solid #fbbf24; background-color: #1f2937; color: #9ca3af; font-style: italic;">');
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

// ============================================
// Premium Email Template
// Stunning, Professional Design
// ============================================

const generateEmailTemplate = (content: {
  preheader?: string;
  accentColor?: string;
  badge?: { text: string; icon?: string };
  title: string;
  subtitle?: string;
  heroImage?: string;
  body: string;
  cta?: { text: string; url: string };
  secondaryCta?: { text: string; url: string };
  infoCards?: Array<{ icon: string; label: string; value: string }>;
  footer?: string;
}) => {
  const accent = content.accentColor || '#fbbf24';

  const infoCardsHtml = content.infoCards?.map(card => `
    <tr>
      <td style="padding: 16px 20px; border-bottom: 1px solid #1f2937;">
        <table cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
          <tr>
            <td style="width: 48px; vertical-align: middle;">
              <div style="width: 44px; height: 44px; background: linear-gradient(135deg, ${accent}20, ${accent}10); border: 1px solid ${accent}30; border-radius: 12px; text-align: center; line-height: 44px; font-size: 20px;">${card.icon}</div>
            </td>
            <td style="vertical-align: middle; padding-left: 16px;">
              <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; font-weight: 500; margin-bottom: 4px;">${card.label}</div>
              <div style="font-size: 16px; color: #f9fafb; font-weight: 600;">${card.value}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('') || '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>code.scriet</title>
</head>
<body style="margin: 0; padding: 0; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  ${content.preheader ? `<div style="display: none; max-height: 0; overflow: hidden; color: #030712;">${content.preheader}${'‌'.repeat(100)}</div>` : ''}
  
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #030712; min-height: 100vh;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        
        <!-- Main Container -->
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px;">
          
          <!-- Logo Header -->
          <tr>
            <td style="padding-bottom: 32px; text-align: center;">
              <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="padding: 16px 28px; background: linear-gradient(135deg, #111827 0%, #0f172a 100%); border: 1px solid #1f2937; border-radius: 16px;">
                    <div style="font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; font-size: 24px; font-weight: 800; color: #fbbf24; letter-spacing: -0.5px;">
                      &lt;code.scriet/&gt;
                    </div>
                  </td>
                </tr>
              </table>
              <div style="margin-top: 12px; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 4px; font-weight: 600;">
                Where Code Meets Excellence
              </div>
            </td>
          </tr>
          
          <!-- Card Container -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(180deg, #111827 0%, #0d1117 100%); border: 1px solid #1f2937; border-radius: 24px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
                
                <!-- Accent Line -->
                <tr>
                  <td style="height: 4px; background: linear-gradient(90deg, ${accent}, #f59e0b, ${accent});"></td>
                </tr>
                
                ${content.heroImage ? `
                <!-- Hero Image -->
                <tr>
                  <td style="padding: 0;">
                    <img src="${content.heroImage}" alt="" style="width: 100%; height: auto; display: block; max-height: 220px; object-fit: cover;" />
                  </td>
                </tr>
                ` : ''}
                
                <!-- Content -->
                <tr>
                  <td style="padding: 32px 24px;">
                    
                    ${content.badge ? `
                    <!-- Badge -->
                    <table cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 8px 16px; background: linear-gradient(135deg, ${accent}25, ${accent}15); border: 1px solid ${accent}40; border-radius: 100px;">
                          <span style="font-size: 12px; font-weight: 600; color: ${accent}; text-transform: uppercase; letter-spacing: 1px;">
                            ${content.badge.icon ? content.badge.icon + '  ' : ''}${content.badge.text}
                          </span>
                        </td>
                      </tr>
                    </table>
                    ` : ''}
                    
                    <!-- Title -->
                    <h1 style="margin: 0 0 16px; font-size: 28px; font-weight: 800; color: #f9fafb; line-height: 1.25; letter-spacing: -0.5px;">
                      ${content.title}
                    </h1>
                    
                    ${content.subtitle ? `
                    <p style="margin: 0 0 28px; font-size: 16px; color: #9ca3af; line-height: 1.6;">
                      ${content.subtitle}
                    </p>
                    ` : ''}
                    
                    ${content.infoCards && content.infoCards.length > 0 ? `
                    <!-- Info Cards -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 28px 0; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden;">
                      ${infoCardsHtml}
                    </table>
                    ` : ''}
                    
                    <!-- Body Content -->
                    <div style="margin: 20px 0; padding: 20px; background: linear-gradient(135deg, #1f293780, #0f172a80); border: 1px solid #1e293b; border-radius: 12px;">
                      ${content.body}
                    </div>
                    
                    ${content.cta ? `
                    <!-- CTA Button -->
                    <table cellpadding="0" cellspacing="0" width="100%" style="margin-top: 28px;">
                      <tr>
                        <td align="center">
                          <a href="${content.cta.url}" style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, ${accent}, ${accent}dd); color: #000000; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 14px ${accent}40;">
                            ${content.cta.text}
                          </a>
                        </td>
                      </tr>
                    </table>
                    ` : ''}
                    
                    ${content.secondaryCta ? `
                    <p style="margin: 20px 0 0;">
                      <a href="${content.secondaryCta.url}" style="color: #9ca3af; font-size: 14px; text-decoration: none; font-weight: 500;">
                        ${content.secondaryCta.text} →
                      </a>
                    </p>
                    ` : ''}
                    
                  </td>
                </tr>
                
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 36px 24px; text-align: center;">
              ${content.footer ? `
              <p style="margin: 0 0 20px; font-size: 14px; color: #6b7280; line-height: 1.6;">
                ${content.footer}
              </p>
              ` : ''}
              
              <!-- Social/Links -->
              <table cellpadding="0" cellspacing="0" style="margin: 0 auto 24px;">
                <tr>
                  <td style="padding: 0 12px;">
                    <a href="${SITE_URL}" style="color: #4b5563; font-size: 13px; text-decoration: none; font-weight: 500;">Website</a>
                  </td>
                  <td style="color: #374151;">•</td>
                  <td style="padding: 0 12px;">
                    <a href="${SITE_URL}/events" style="color: #4b5563; font-size: 13px; text-decoration: none; font-weight: 500;">Events</a>
                  </td>
                  <td style="color: #374151;">•</td>
                  <td style="padding: 0 12px;">
                    <a href="${SITE_URL}/dashboard" style="color: #4b5563; font-size: 13px; text-decoration: none; font-weight: 500;">Dashboard</a>
                  </td>
                </tr>
              </table>
              
              <!-- Support Contact -->
              <div style="margin: 0 auto 20px; padding: 16px 24px; background: #0f0f10; border: 1px solid #1f2937; border-radius: 10px; max-width: 400px;">
                <p style="margin: 0 0 6px; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Need Assistance?</p>
                <p style="margin: 0; font-size: 13px; color: #9ca3af; line-height: 1.5;">
                  For any queries or issues, reach out to our tech team at<br>
                  <a href="mailto:${EMAIL_REPLY_TO}" style="color: #fbbf24; text-decoration: none; font-weight: 600;">${EMAIL_REPLY_TO}</a>
                </p>
              </div>
              
              <p style="margin: 0; font-size: 11px; color: #4b5563; line-height: 1.7;">
                © 2026 code.scriet · SCRIET, CCS University<br>
                <span style="color: #374151;">Building tomorrow's tech leaders, one commit at a time.</span>
              </p>
            </td>
          </tr>
          
        </table>
        
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

// ============================================
// Email Templates
// ============================================

export const EmailTemplates = {
  // Welcome email for new members
  welcome: (name: string, clubName: string, customBody?: string, customFooter?: string): EmailTemplate => {
    const bodyContent = customBody
      ? markdownToEmailHtml(customBody.replace(/\{\{name\}\}/g, name).replace(/\{\{clubName\}\}/g, clubName))
      : `
        <p style="margin: 0 0 20px; font-size: 16px; color: #e5e7eb; line-height: 1.8;">
          You've just joined an exclusive community of <strong style="color: #fbbf24;">ambitious developers</strong> who refuse to settle for ordinary. At ${clubName}, we don't just write code—we craft solutions that matter.
        </p>
        
        <div style="margin: 24px 0; padding: 24px; background: linear-gradient(135deg, #18181b, #0f0f10); border: 1px solid #27272a; border-radius: 12px;">
          <p style="margin: 0 0 16px; font-size: 12px; color: #fbbf24; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Your Elite Membership Includes</p>
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #27272a;">
                <span style="color: #fbbf24; font-size: 16px;">⚡</span>
                <span style="color: #f9fafb; font-weight: 600; margin-left: 12px;">Daily Challenges</span>
                <span style="color: #71717a; font-size: 13px; margin-left: 8px;">— Competitive coding that sharpens your edge</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #27272a;">
                <span style="color: #fbbf24; font-size: 16px;">🎯</span>
                <span style="color: #f9fafb; font-weight: 600; margin-left: 12px;">Exclusive Events</span>
                <span style="color: #71717a; font-size: 13px; margin-left: 8px;">— Hackathons, workshops, tech talks</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #27272a;">
                <span style="color: #fbbf24; font-size: 16px;">🏆</span>
                <span style="color: #f9fafb; font-weight: 600; margin-left: 12px;">Leaderboard Rankings</span>
                <span style="color: #71717a; font-size: 13px; margin-left: 8px;">— Prove your skills, earn recognition</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 10px 0;">
                <span style="color: #fbbf24; font-size: 16px;">🤝</span>
                <span style="color: #f9fafb; font-weight: 600; margin-left: 12px;">Elite Network</span>
                <span style="color: #71717a; font-size: 13px; margin-left: 8px;">— Connect with top developers</span>
              </td>
            </tr>
          </table>
        </div>
        
        <p style="margin: 0; font-size: 15px; color: #a1a1aa; line-height: 1.7;">
          The best developers never stop learning. Your journey to excellence starts now.
        </p>
      `;

    return {
      subject: `Welcome to the Elite, ${name} · ${clubName}`,
      html: generateEmailTemplate({
        preheader: `Your ${clubName} membership is now active. Let's build something legendary.`,
        accentColor: '#fbbf24',
        badge: { text: 'Membership Activated', icon: '✦' },
        title: `Welcome to the Inner Circle, ${name}`,
        subtitle: `You've been granted access to ${clubName}. Not everyone makes it here.`,
        body: bodyContent,
        cta: { text: 'Access Your Dashboard', url: `${SITE_URL}/dashboard` },
        footer: customFooter || 'Excellence is not a destination. It\'s a continuous journey.',
      }),
      text: `Welcome to ${clubName}, ${name}! You're now part of our elite developer community. Visit ${SITE_URL}/dashboard to begin.`,
    };
  },

  // Event registration confirmation
  eventRegistration: async (name: string, eventTitle: string, eventDate: Date, eventSlug: string, location?: string, imageUrl?: string, attendanceToken?: string): Promise<EmailTemplate> => {
    // Generate QR code as CID inline attachment if attendance token is provided
    let qrSection = '';
    const attachments: EmailAttachment[] = [];
    if (attendanceToken) {
      try {
        const qrDataUrl = await QRCode.toDataURL(attendanceToken, {
          width: 200,
          margin: 1,
          color: { dark: '#1c1917', light: '#ffffff' },
        });
        // Strip data URI prefix to get raw base64 for Brevo attachment
        const qrBase64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
        attachments.push({ content: qrBase64, name: 'qr-ticket.png' });
        qrSection = `
        <div style="text-align:center; margin: 24px 0; padding: 20px; background: linear-gradient(135deg, #fef3c715, #fde68a10); border: 1px solid #f59e0b30; border-radius: 12px;">
          <p style="margin: 0 0 12px; font-size: 13px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Your QR Attendance Ticket</p>
          <div style="display:inline-block; padding: 8px; background: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <img src="cid:qr-ticket.png" alt="QR Attendance Ticket" width="160" height="160" style="display:block; border-radius:4px;" />
          </div>
          <p style="margin: 12px 0 0; font-size: 11px; color: #9ca3af;">Show this QR code at the event entrance for check-in</p>
          <p style="margin: 8px 0 0; font-size: 11px; color: #6b7280;">Can't see the QR? <a href="${SITE_URL}/dashboard/events" style="color: #fbbf24; text-decoration: underline;">View your ticket in your dashboard</a></p>
        </div>`;
      } catch (err) {
        logger.warn('Failed to generate QR code for registration email', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      subject: `Confirmed · ${eventTitle}`,
      attachments,
      html: generateEmailTemplate({
        preheader: `Your seat is secured for ${eventTitle}. See you there.`,
        accentColor: '#10b981',
        badge: { text: 'Registration Confirmed', icon: '✓' },
        title: `You're In, ${name}`,
        subtitle: `Your exclusive spot for "${eventTitle}" has been secured.`,
        heroImage: imageUrl,
        infoCards: [
          { icon: '📅', label: 'Date', value: eventDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' }) },
          { icon: '⏰', label: 'Time', value: eventDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) },
          ...(location ? [{ icon: '📍', label: 'Venue', value: location }] : []),
        ],
        body: `
        <p style="margin: 0 0 16px; font-size: 15px; color: #d1d5db; line-height: 1.7;">
          Your commitment to growth sets you apart. We've reserved your seat—now it's time to show up and level up.
        </p>

        <div style="padding: 16px 20px; background: linear-gradient(135deg, #10b98115, #05966910); border-left: 3px solid #10b981; border-radius: 0 12px 12px 0;">
          <p style="margin: 0; font-size: 14px; color: #6ee7b7;">
            <strong>Insider tip:</strong> Arrive 10 minutes early. The best connections happen before the session starts.
          </p>
        </div>
        ${qrSection}
      `,
        cta: { text: 'View Event Details', url: `${SITE_URL}/events/${eventSlug}` },
        footer: 'The future belongs to those who prepare for it.',
      }),
      text: `Hi ${name}, your registration for ${eventTitle} on ${eventDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} is confirmed!`,
    };
  },

  // New Announcement notification
  newAnnouncement: (title: string, body: string, priority: string, slug: string, shortDescription?: string, imageUrl?: string, tags?: string[], customIntro?: string, customFooter?: string): EmailTemplate => {
    const priorityConfig = {
      URGENT: { text: 'Critical Alert', icon: '🚨', color: '#ef4444' },
      HIGH: { text: 'Priority Notice', icon: '⚡', color: '#f59e0b' },
      MEDIUM: { text: 'Announcement', icon: '📢', color: '#d97706' },
      LOW: { text: 'Update', icon: '📌', color: '#71717a' },
    };
    const config = priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.MEDIUM;

    const htmlBody = markdownToEmailHtml(body.length > 800 ? body.substring(0, 800) + '...' : body);
    const finalBody = customIntro
      ? `<div style="margin-bottom: 20px;">${markdownToEmailHtml(customIntro)}</div>${htmlBody}`
      : htmlBody;

    return {
      subject: priority === 'URGENT' ? `[URGENT] ${title}` : title,
      html: generateEmailTemplate({
        preheader: shortDescription || `New announcement from code.scriet`,
        accentColor: config.color,
        badge: { text: config.text, icon: config.icon },
        title: title,
        subtitle: shortDescription,
        heroImage: imageUrl,
        body: finalBody,
        cta: { text: 'Read Full Announcement', url: `${SITE_URL}/announcements/${slug}` },
        footer: customFooter || 'Stay informed, stay ahead.',
      }),
      text: `[${priority}] ${title}\n\n${shortDescription || ''}\n\n${body}\n\nRead more: ${SITE_URL}/announcements/${slug}`,
    };
  },

  // New Event notification
  newEvent: (title: string, description: string, startDate: Date, slug: string, shortDescription?: string, location?: string, imageUrl?: string, tags?: string[], eventType?: string, customIntro?: string, customFooter?: string): EmailTemplate => {
    const descriptionHtml = markdownToEmailHtml(description.length > 600 ? description.substring(0, 600) + '...' : description);
    const bodyContent = customIntro
      ? `<div style="margin-bottom: 16px;">${markdownToEmailHtml(customIntro)}</div>${descriptionHtml}`
      : descriptionHtml;

    return {
      subject: `[Event] ${title} · code.scriet`,
      html: generateEmailTemplate({
        preheader: `${title} — An exclusive opportunity you don't want to miss.`,
        accentColor: '#10b981',
        badge: { text: eventType || 'Exclusive Event', icon: '◆' },
        title: title,
        subtitle: shortDescription || description.substring(0, 150),
        heroImage: imageUrl,
        infoCards: [
          { icon: '📅', label: 'Date', value: startDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' }) },
          { icon: '⏰', label: 'Time', value: startDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) },
          ...(location ? [{ icon: '📍', label: 'Venue', value: location }] : []),
        ],
        body: bodyContent,
        cta: { text: 'Secure Your Spot', url: `${SITE_URL}/events/${slug}` },
        secondaryCta: { text: 'Browse all events', url: `${SITE_URL}/events` },
        footer: customFooter || 'Elite opportunities don\'t wait. Neither should you.',
      }),
      text: `New Event: ${title}\n\nDate: ${startDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}\nTime: ${startDate.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}\n${location ? `Location: ${location}\n` : ''}\n${description}\n\nRegister: ${SITE_URL}/events/${slug}`,
    };
  },

  // Password reset
  passwordReset: (name: string, resetLink: string): EmailTemplate => ({
    subject: 'Security Alert · Password Reset Requested',
    html: generateEmailTemplate({
      preheader: 'A password reset was requested for your code.scriet account',
      accentColor: '#f97316',
      badge: { text: 'Security Alert', icon: '🔒' },
      title: 'Password Reset Requested',
      subtitle: `${name}, someone requested a password reset for your account.`,
      body: `
        <p style="margin: 0 0 20px; font-size: 15px; color: #d1d5db; line-height: 1.8;">
          Use the secure button below to create a new password. For your protection, this link expires in <strong style="color: #fbbf24;">60 minutes</strong>.
        </p>
        
        <div style="padding: 20px; background: #18181b; border: 1px solid #ef444430; border-radius: 10px;">
          <p style="margin: 0 0 8px; font-size: 12px; color: #ef4444; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">🛡️ Security Notice</p>
          <p style="margin: 0; font-size: 14px; color: #fca5a5; line-height: 1.6;">
            If you didn't request this reset, your account is still secure—simply ignore this email. No changes will be made.
          </p>
        </div>
      `,
      cta: { text: 'Reset Password Securely', url: resetLink },
      footer: 'Your security is our priority.',
    }),
    text: `Hi ${name}, click this link to reset your password: ${resetLink}. This link expires in 1 hour.`,
  }),

  // Event reminder
  eventReminder: (name: string, eventTitle: string, eventDate: Date, eventSlug: string): EmailTemplate => ({
    subject: `Tomorrow · ${eventTitle}`,
    html: generateEmailTemplate({
      preheader: `${eventTitle} is happening tomorrow. Are you ready?`,
      accentColor: '#fbbf24',
      badge: { text: 'Happening Tomorrow', icon: '⚡' },
      title: `${name}, Tomorrow's the Day`,
      subtitle: `"${eventTitle}" kicks off in less than 24 hours.`,
      infoCards: [
        { icon: '📅', label: 'Date', value: eventDate.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' }) },
        { icon: '⏰', label: 'Time', value: eventDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) },
      ],
      body: `
        <p style="margin: 0 0 16px; font-size: 15px; color: #d1d5db; line-height: 1.7;">
          The countdown is on. Here's how to make the most of tomorrow:
        </p>
        
        <div style="margin: 16px 0; padding: 16px 20px; background: #18181b; border: 1px solid #27272a; border-radius: 10px;">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr><td style="padding: 8px 0; color: #a1a1aa; font-size: 14px;"><span style="color: #fbbf24; margin-right: 10px;">01</span> Review any shared materials or prerequisites</td></tr>
            <tr><td style="padding: 8px 0; color: #a1a1aa; font-size: 14px;"><span style="color: #fbbf24; margin-right: 10px;">02</span> Arrive 10 minutes early for networking</td></tr>
            <tr><td style="padding: 8px 0; color: #a1a1aa; font-size: 14px;"><span style="color: #fbbf24; margin-right: 10px;">03</span> Bring your laptop, notebook, and curiosity</td></tr>
          </table>
        </div>
        
        <p style="margin: 16px 0 0; font-size: 14px; color: #71717a; font-style: italic;">
          "The only way to do great work is to love what you do." — Steve Jobs
        </p>
      `,
      cta: { text: 'View Event Details', url: `${SITE_URL}/events/${eventSlug}` },
      footer: 'Prepared minds seize the best opportunities.',
    }),
    text: `Hi ${name}, reminder: ${eventTitle} is tomorrow at ${eventDate.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}!`,
  }),

  // Registration opens notification
  registrationOpens: (eventTitle: string, startDate: Date, slug: string, shortDescription?: string, imageUrl?: string): EmailTemplate => ({
    subject: `Now Open · ${eventTitle}`,
    html: generateEmailTemplate({
      preheader: `Early access registration is now open for ${eventTitle}`,
      accentColor: '#10b981',
      badge: { text: 'Now Accepting Registrations', icon: '◆' },
      title: 'Registration is Live',
      subtitle: `"${eventTitle}" is now accepting participants. Secure your spot before it fills up.`,
      heroImage: imageUrl,
      infoCards: [
        { icon: '📅', label: 'Event Date', value: startDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' }) },
        { icon: '⏰', label: 'Time', value: startDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) },
      ],
      body: `
        ${shortDescription ? `<p style="margin: 0 0 16px; font-size: 15px; color: #d1d5db; line-height: 1.7;">${shortDescription}</p>` : ''}
        
        <div style="padding: 16px 20px; background: linear-gradient(135deg, #fbbf2415, #f59e0b10); border-left: 3px solid #fbbf24; border-radius: 0 12px 12px 0;">
          <p style="margin: 0; font-size: 14px; color: #fcd34d;">
            <strong>Limited capacity.</strong> Our events fill up fast—act now to guarantee your seat.
          </p>
        </div>
      `,
      cta: { text: 'Register Now', url: `${SITE_URL}/events/${slug}` },
      footer: 'First movers get the advantage. Always.',
    }),
    text: `Registration is now open for ${eventTitle}! Date: ${startDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}. Register: ${SITE_URL}/events/${slug}`,
  }),

  // Hiring application confirmation
  hiringApplication: (name: string, email: string, applyingRole: string): EmailTemplate => {
    const roleNames: Record<string, string> = {
      TECHNICAL: 'Technical Division',
      DSA_CHAMPS: 'DSA Champs Division',
      DESIGNING: 'Design Division',
      SOCIAL_MEDIA: 'Social Media Division',
      MANAGEMENT: 'Operations & Management',
    };
    const roleName = roleNames[applyingRole] || applyingRole;

    return {
      subject: `Application Received · ${roleName} · code.scriet`,
      html: generateEmailTemplate({
        preheader: `Your application for ${roleName} is now being reviewed by our selection committee.`,
        accentColor: '#f472b6',
        badge: { text: 'Application Under Review', icon: '◈' },
        title: `We've Received Your Application, ${name}`,
        subtitle: `Your candidacy for the ${roleName} is now in our system.`,
        body: `
          <p style="margin: 0 0 20px; font-size: 15px; color: #d1d5db; line-height: 1.8;">
            Thank you for expressing interest in joining <strong style="color: #fbbf24;">code.scriet</strong>. We receive applications from many talented individuals, and yours is now being carefully reviewed by our selection committee.
          </p>
          
          <div style="margin: 20px 0; padding: 24px; background: #18181b; border: 1px solid #27272a; border-radius: 12px;">
            <p style="margin: 0 0 16px; font-size: 12px; color: #f472b6; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Selection Process</p>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #27272a;">
                  <span style="display: inline-block; width: 28px; height: 28px; background: linear-gradient(135deg, #f472b6, #ec4899); border-radius: 50%; text-align: center; line-height: 28px; color: #000; font-weight: 700; font-size: 12px;">1</span>
                  <span style="color: #f9fafb; font-weight: 500; margin-left: 14px;">Added to Recruitment Portal</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #27272a;">
                  <span style="display: inline-block; width: 28px; height: 28px; background: #27272a; border-radius: 50%; text-align: center; line-height: 28px; color: #71717a; font-weight: 700; font-size: 12px;">2</span>
                  <span style="color: #a1a1aa; margin-left: 14px;">Application Review by Division Leads</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 0;">
                  <span style="display: inline-block; width: 28px; height: 28px; background: #27272a; border-radius: 50%; text-align: center; line-height: 28px; color: #71717a; font-weight: 700; font-size: 12px;">3</span>
                  <span style="color: #a1a1aa; margin-left: 14px;">Google Meet Interview Link via Email & Portal</span>
                </td>
              </tr>
            </table>
          </div>
          
          <div style="margin: 20px 0; padding: 16px 20px; background: #0f0f10; border: 1px solid #27272a; border-radius: 10px;">
            <p style="margin: 0 0 8px; font-size: 12px; color: #71717a; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">📦 Regarding Login Credentials</p>
            <p style="margin: 0; font-size: 14px; color: #a1a1aa; line-height: 1.6;">
              Login credentials are sent in <strong style="color: #f9fafb;">batches</strong> and may take some time. Once available, they will appear in the <strong style="color: #fbbf24;">Updates</strong> section of the recruitment portal and will be emailed to you.
            </p>
          </div>
          
          <div style="padding: 20px; background: linear-gradient(135deg, #fbbf2410, #f59e0b08); border: 1px solid #fbbf2430; border-radius: 10px;">
            <p style="margin: 0 0 8px; font-size: 13px; color: #fbbf24; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">⚠ Critical Notice</p>
            <p style="margin: 0; font-size: 14px; color: #fcd34d; line-height: 1.7;">
              Monitor your inbox <strong>daily</strong>—including <strong>Spam</strong> and <strong>Promotions</strong> folders. All recruitment communications will be sent to <strong style="color: #fff;">${email}</strong>. Missing an email could mean missing your opportunity.
            </p>
          </div>
          
          <p style="margin: 24px 0 0; font-size: 14px; color: #71717a; line-height: 1.7; font-style: italic;">
            "We don't just look for skills. We look for potential, hunger, and the drive to build something meaningful."
          </p>
        `,
        cta: { text: 'Explore code.scriet', url: SITE_URL },
        footer: 'May the code be with you.',
      }),
      text: `Hi ${name}, thanks for applying to the ${roleName}! Your application has been received. You'll be added to our recruitment portal and will receive updates at ${email}. Please check your email (including spam/promotions) at least once a day.`,
    };
  },

  // Hiring application SELECTED
  hiringSelected: (name: string, applyingRole: string): EmailTemplate => {
    const roleNames: Record<string, string> = {
      TECHNICAL: 'Technical Division',
      DSA_CHAMPS: 'DSA Champs Division',
      DESIGNING: 'Design Division',
      SOCIAL_MEDIA: 'Social Media Division',
      MANAGEMENT: 'Operations & Management',
    };
    const roleName = roleNames[applyingRole] || applyingRole;

    return {
      subject: `🎉 Congratulations! You're Now Part of code.scriet · ${roleName}`,
      html: generateEmailTemplate({
        preheader: `Welcome to the team! You've been selected to join ${roleName} at code.scriet.`,
        accentColor: '#10b981',
        badge: { text: 'Selection Confirmed', icon: '🏆' },
        title: `Congratulations, ${name}!`,
        subtitle: `You've been officially selected to join the ${roleName} at code.scriet. Welcome to the family!`,
        body: `
          <p style="margin: 0 0 20px; font-size: 16px; color: #e5e7eb; line-height: 1.8;">
            After careful review, we're thrilled to inform you that <strong style="color: #10b981;">you've made it!</strong> Your skills, passion, and potential stood out among many talented applicants. This is just the beginning of an incredible journey.
          </p>
          
          <div style="margin: 24px 0; padding: 24px; background: linear-gradient(135deg, #10b98115, #05966910); border: 1px solid #10b98140; border-radius: 12px;">
            <p style="margin: 0 0 16px; font-size: 12px; color: #10b981; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">🚀 What Happens Next</p>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #10b98130;">
                  <span style="display: inline-block; width: 28px; height: 28px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 50%; text-align: center; line-height: 28px; color: #000; font-weight: 700; font-size: 12px;">1</span>
                  <span style="color: #f9fafb; font-weight: 500; margin-left: 14px;">WhatsApp Group</span>
                  <span style="color: #71717a; font-size: 13px; display: block; margin-left: 42px;">You'll be added to our official team WhatsApp groups shortly</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #10b98130;">
                  <span style="display: inline-block; width: 28px; height: 28px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 50%; text-align: center; line-height: 28px; color: #000; font-weight: 700; font-size: 12px;">2</span>
                  <span style="color: #f9fafb; font-weight: 500; margin-left: 14px;">Website Profile</span>
                  <span style="color: #71717a; font-size: 13px; display: block; margin-left: 42px;">Your profile will be featured on our team page</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 0;">
                  <span style="display: inline-block; width: 28px; height: 28px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 50%; text-align: center; line-height: 28px; color: #000; font-weight: 700; font-size: 12px;">3</span>
                  <span style="color: #f9fafb; font-weight: 500; margin-left: 14px;">Join Discord</span>
                  <span style="color: #71717a; font-size: 13px; display: block; margin-left: 42px;">Head to our website and join the Discord community for all updates</span>
                </td>
              </tr>
            </table>
          </div>
          
          <div style="padding: 20px; background: linear-gradient(135deg, #fbbf2415, #f59e0b10); border: 1px solid #fbbf2440; border-radius: 10px;">
            <p style="margin: 0 0 8px; font-size: 13px; color: #fbbf24; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">💡 Important</p>
            <p style="margin: 0; font-size: 14px; color: #fcd34d; line-height: 1.7;">
              Make sure to <strong>join our Discord server</strong> through the website—it's where all the action happens. Team meetings, project discussions, and announcements all flow through Discord.
            </p>
          </div>
          
          <p style="margin: 24px 0 0; font-size: 15px; color: #a1a1aa; line-height: 1.7;">
            We can't wait to see the amazing things you'll build with us. Welcome aboard, <strong style="color: #10b981;">${name}</strong>! 🎉
          </p>
        `,
        cta: { text: 'Visit code.scriet & Join Discord', url: SITE_URL },
        footer: 'The best is yet to come. Let\'s build something legendary together.',
      }),
      text: `Congratulations ${name}! You've been selected to join the ${roleName} at code.scriet! You'll be added to our WhatsApp groups and website soon. Please visit ${SITE_URL} and join our Discord server for all updates and team communications. Welcome to the team!`,
    };
  },

  // Hiring application REJECTED
  hiringRejected: (name: string, applyingRole: string): EmailTemplate => {
    const roleNames: Record<string, string> = {
      TECHNICAL: 'Technical Division',
      DSA_CHAMPS: 'DSA Champs Division',
      DESIGNING: 'Design Division',
      SOCIAL_MEDIA: 'Social Media Division',
      MANAGEMENT: 'Operations & Management',
    };
    const roleName = roleNames[applyingRole] || applyingRole;

    return {
      subject: `Application Update · ${roleName} · code.scriet`,
      html: generateEmailTemplate({
        preheader: `An update regarding your application to the ${roleName} at code.scriet`,
        accentColor: '#6b7280',
        badge: { text: 'Application Update', icon: '📋' },
        title: `Thank You for Applying, ${name}`,
        subtitle: `We appreciate your interest in joining the ${roleName} at code.scriet.`,
        body: `
          <p style="margin: 0 0 20px; font-size: 16px; color: #e5e7eb; line-height: 1.8;">
            After carefully reviewing all applications, we regret to inform you that we won't be moving forward with your application for the <strong style="color: #f9fafb;">${roleName}</strong> at this time.
          </p>
          
          <p style="margin: 0 0 20px; font-size: 15px; color: #d1d5db; line-height: 1.8;">
            This decision was not easy—we received many strong applications, and the competition was fierce. Please don't let this discourage you. Every successful developer has faced setbacks, and what matters is how you respond.
          </p>
          
          <div style="margin: 24px 0; padding: 24px; background: linear-gradient(135deg, #18181b, #0f0f10); border: 1px solid #27272a; border-radius: 12px;">
            <p style="margin: 0 0 16px; font-size: 12px; color: #fbbf24; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">💪 Our Recommendation</p>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #27272a;">
                  <span style="color: #fbbf24; font-size: 16px;">📚</span>
                  <span style="color: #f9fafb; font-weight: 500; margin-left: 12px;">Strengthen Your Fundamentals</span>
                  <span style="color: #71717a; font-size: 13px; display: block; margin-left: 34px; margin-top: 4px;">Focus on core concepts—they're the foundation of everything</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #27272a;">
                  <span style="color: #fbbf24; font-size: 16px;">🛠️</span>
                  <span style="color: #f9fafb; font-weight: 500; margin-left: 12px;">Build Real Projects</span>
                  <span style="color: #71717a; font-size: 13px; display: block; margin-left: 34px; margin-top: 4px;">Nothing beats hands-on experience with actual applications</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 10px 0;">
                  <span style="color: #fbbf24; font-size: 16px;">🔄</span>
                  <span style="color: #f9fafb; font-weight: 500; margin-left: 12px;">Apply Again When Ready</span>
                  <span style="color: #71717a; font-size: 13px; display: block; margin-left: 34px; margin-top: 4px;">Our doors are always open—come back stronger in the next round</span>
                </td>
              </tr>
            </table>
          </div>
          
          <div style="padding: 16px 20px; background: linear-gradient(135deg, #10b98115, #05966910); border-left: 3px solid #10b981; border-radius: 0 12px 12px 0;">
            <p style="margin: 0; font-size: 14px; color: #6ee7b7; line-height: 1.7;">
              <strong>Remember:</strong> This isn't a "no"—it's a "not yet." When you feel ready, we'd love to see you apply again. Growth is a journey, and we believe in second chances.
            </p>
          </div>
          
          <p style="margin: 24px 0 0; font-size: 14px; color: #71717a; line-height: 1.7; font-style: italic;">
            "Success is not final, failure is not fatal: it is the courage to continue that counts." — Winston Churchill
          </p>
        `,
        cta: { text: 'Explore code.scriet Events', url: `${SITE_URL}/events` },
        secondaryCta: { text: 'Join our public events and keep learning', url: `${SITE_URL}/events` },
        footer: 'Keep coding, keep growing. We hope to see you again.',
      }),
      text: `Hi ${name}, thank you for applying to the ${roleName} at code.scriet. After careful review, we won't be moving forward with your application at this time. We encourage you to work on strengthening your fundamentals and building projects. When you feel ready, we'd love to see you apply again in the next recruitment round. Keep learning and growing!`,
    };
  },

  // General-purpose admin mail (info sharing, invitations, updates, etc.)
  adminMail: (subject: string, body: string, bodyType: 'markdown' | 'html' = 'markdown'): EmailTemplate => {
    const htmlBody = bodyType === 'html' ? body : markdownToEmailHtml(body);
    const plainText = htmlToPlainText(htmlBody);

    return {
      subject,
      html: generateEmailTemplate({
        preheader: subject,
        accentColor: '#d97706',
        badge: { text: 'code.scriet', icon: '✉️' },
        title: subject,
        body: htmlBody,
        footer: 'Sent by code.scriet team',
      }),
      text: plainText,
    };
  },
};

// ============================================
// Brevo Email Service Implementation
// ============================================

class EmailService {
  private configured: boolean = false;
  private apiKey: string;
  private fromEmail: string;
  private fromName: string;
  private replyToEmail: string;

  constructor() {
    this.apiKey = BREVO_API_KEY;
    this.fromEmail = EMAIL_FROM;
    this.fromName = EMAIL_FROM_NAME;
    this.replyToEmail = EMAIL_REPLY_TO;
    this.configured = !!this.apiKey;

    if (this.configured) {
      logger.info('📧 Brevo email service configured successfully');
    } else {
      logger.warn('📧 Email service not configured - BREVO_API_KEY not set');
    }
  }

  async send(options: EmailOptions): Promise<boolean> {
    if (!this.configured) {
      logger.debug('Email service not configured, skipping email', {
        to: Array.isArray(options.to) ? options.to.length + ' recipients' : options.to,
        bcc: Array.isArray(options.bcc) ? options.bcc.length + ' bcc recipients' : options.bcc,
        subject: options.subject
      });
      return false;
    }

    // ── Notification guard: category toggle + testing mode ──
    const category = options.category || 'other';
    const ns = await getNotificationSettings();

    const toggleKey = CATEGORY_TOGGLE_MAP[category];
    if (toggleKey && !ns[toggleKey]) {
      logger.info(`📧 Email suppressed by ${toggleKey} toggle`, {
        category,
        to: Array.isArray(options.to) ? `${(options.to as string[]).length} recipients` : options.to,
        subject: options.subject,
      });
      return false;
    }

    if (ns.emailTestingMode && category !== 'other') {
      const testEmails = (ns.emailTestRecipients || '')
        .split(',')
        .map(e => e.trim())
        .filter(e => e.length > 0);

      if (testEmails.length === 0) {
        logger.warn('📧 Email testing mode active but no test recipients configured — suppressing', {
          category,
          originalTo: Array.isArray(options.to) ? options.to : [options.to],
          subject: options.subject,
        });
        return false;
      }

      const originalRecipients = Array.isArray(options.to) ? options.to : [options.to];
      logger.info('📧 Email testing mode: redirecting email', {
        category,
        originalRecipients: originalRecipients.slice(0, 20),
        originalCount: originalRecipients.length,
        redirectedTo: testEmails,
        subject: options.subject,
      });

      options.subject = `[TEST] ${options.subject}`;
      options.to = testEmails;
      options.bcc = undefined;

      const recipientPreview = originalRecipients.slice(0, 10).join(', ');
      const moreCount = originalRecipients.length > 10 ? ` + ${originalRecipients.length - 10} more` : '';
      const debugHeader = `<div style="background:#fef08a;color:#854d0e;padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:13px;font-family:sans-serif;"><strong>🧪 TEST MODE</strong> — Original recipients (${originalRecipients.length}): ${recipientPreview}${moreCount}</div>`;
      options.html = debugHeader + options.html;
    }

    try {
      const recipients: BrevoRecipient[] = Array.isArray(options.to)
        ? options.to.map(email => ({ email }))
        : [{ email: options.to }];

      const bccRecipients: BrevoRecipient[] = options.bcc
        ? (Array.isArray(options.bcc) ? options.bcc : [options.bcc]).map(email => ({ email }))
        : [];

      const payload = {
        sender: { name: this.fromName, email: this.fromEmail },
        replyTo: { email: this.replyToEmail, name: 'code.scriet Support' },
        to: recipients,
        ...(bccRecipients.length > 0 ? { bcc: bccRecipients } : {}),
        subject: options.subject,
        htmlContent: options.html,
        textContent: options.text || htmlToPlainText(options.html),
        ...(options.attachments?.length ? { attachment: options.attachments } : {}),
      };

      const response = await fetch(BREVO_API_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': this.apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('❌ Brevo API error:', { status: response.status, body: errorText });
        throw new Error(`Brevo API error: ${response.status}`);
      }

      const result = await response.json();
      logger.info('📧 Email sent via Brevo', {
        messageId: result.messageId,
        recipients: recipients.length,
        bccRecipients: bccRecipients.length,
        subject: options.subject,
      });
      return true;
    } catch (error) {
      logger.error('❌ Failed to send email', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  async sendBulk(emails: string[], subject: string, html: string, text?: string, category: EmailCategory = 'other'): Promise<boolean> {
    if (!this.configured || emails.length === 0) return false;

    // ── Notification guard: category toggle + testing mode ──
    const ns = await getNotificationSettings();

    const toggleKey = CATEGORY_TOGGLE_MAP[category];
    if (toggleKey && !ns[toggleKey]) {
      logger.info(`📧 Bulk email suppressed by ${toggleKey} toggle`, {
        category,
        recipientCount: emails.length,
        subject,
      });
      return false;
    }

    if (ns.emailTestingMode && category !== 'other') {
      const testEmails = (ns.emailTestRecipients || '')
        .split(',')
        .map(e => e.trim())
        .filter(e => e.length > 0);

      if (testEmails.length === 0) {
        logger.warn('📧 Bulk email testing mode active but no test recipients — suppressing', {
          category,
          originalCount: emails.length,
          subject,
        });
        return false;
      }

      logger.info('📧 Bulk email testing mode: redirecting', {
        category,
        originalCount: emails.length,
        redirectedTo: testEmails,
        subject,
      });

      const debugHeader = `<div style="background:#fef08a;color:#854d0e;padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:13px;font-family:sans-serif;"><strong>🧪 TEST MODE</strong> — Would have sent to ${emails.length} recipients</div>`;
      return this.send({
        to: testEmails,
        subject: `[TEST] ${subject}`,
        html: debugHeader + html,
        text: `[TEST MODE - Would send to ${emails.length} recipients] ${text || ''}`,
      });
    }

    const BATCH_SIZE = 1000;
    const batches: string[][] = [];
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      batches.push(emails.slice(i, i + BATCH_SIZE));
    }

    logger.info(`📧 Sending bulk email to ${emails.length} recipients in ${batches.length} batches`);

    let allSuccessful = true;
    for (const batch of batches) {
      const success = await this.sendBatchMessageVersions(batch, subject, html, text);
      if (!success) allSuccessful = false;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return allSuccessful;
  }

  private async sendBatchMessageVersions(
    emails: string[],
    subject: string,
    html: string,
    text?: string
  ): Promise<boolean> {
    if (!this.configured || emails.length === 0) return false;

    try {
      const messageVersions = emails.map(email => ({
        to: [{ email }],
      }));

      const payload = {
        sender: { name: this.fromName, email: this.fromEmail },
        replyTo: { email: this.replyToEmail, name: 'code.scriet Support' },
        subject,
        htmlContent: html,
        textContent: text || htmlToPlainText(html),
        messageVersions,
      };

      const response = await fetch(BREVO_API_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': this.apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('❌ Brevo batch API error:', { status: response.status, body: errorText });
        throw new Error(`Brevo batch API error: ${response.status}`);
      }

      const result = await response.json();
      const messageCount = Array.isArray(result.messageIds) ? result.messageIds.length : 0;
      logger.info('📧 Batch email sent via Brevo', {
        recipients: emails.length,
        messageIds: messageCount,
        subject,
      });
      return true;
    } catch (error) {
      logger.error('❌ Failed to send batch email', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  // Convenience methods
  async sendWelcome(email: string, name: string, clubName: string = 'code.scriet'): Promise<boolean> {
    const config = await getEmailTemplateConfig();
    const template = EmailTemplates.welcome(name, clubName, config.welcomeBody, config.footerText);
    return this.send({ to: email, ...template, category: 'welcome' });
  }

  async sendEventRegistration(email: string, name: string, eventTitle: string, eventDate: Date, eventSlug: string, location?: string, imageUrl?: string, attendanceToken?: string): Promise<boolean> {
    const template = await EmailTemplates.eventRegistration(name, eventTitle, eventDate, eventSlug, location, imageUrl, attendanceToken);
    return this.send({ to: email, ...template, category: 'registration' });
  }

  async sendAnnouncementToAll(emails: string[], title: string, body: string, priority: string, slug: string, shortDescription?: string, imageUrl?: string, tags?: string[]): Promise<boolean> {
    const config = await getEmailTemplateConfig();
    const template = EmailTemplates.newAnnouncement(title, body, priority, slug, shortDescription, imageUrl, tags, config.announcementIntro, config.footerText);
    return this.sendBulk(emails, template.subject, template.html, template.text, 'announcement');
  }

  async sendNewEventToAll(emails: string[], title: string, description: string, startDate: Date, slug: string, shortDescription?: string, location?: string, imageUrl?: string, tags?: string[], eventType?: string): Promise<boolean> {
    const config = await getEmailTemplateConfig();
    const template = EmailTemplates.newEvent(title, description, startDate, slug, shortDescription, location, imageUrl, tags, eventType, config.eventIntro, config.footerText);
    return this.sendBulk(emails, template.subject, template.html, template.text, 'event_creation');
  }

  async sendPasswordReset(email: string, name: string, resetLink: string): Promise<boolean> {
    const template = EmailTemplates.passwordReset(name, resetLink);
    return this.send({ to: email, ...template });
  }

  async sendEventReminder(email: string, name: string, eventTitle: string, eventDate: Date, eventSlug: string): Promise<boolean> {
    const template = EmailTemplates.eventReminder(name, eventTitle, eventDate, eventSlug);
    return this.send({ to: email, ...template, category: 'reminder' });
  }

  async sendRegistrationOpens(emails: string[], eventTitle: string, startDate: Date, slug: string, shortDescription?: string, imageUrl?: string): Promise<boolean> {
    const template = EmailTemplates.registrationOpens(eventTitle, startDate, slug, shortDescription, imageUrl);
    return this.sendBulk(emails, template.subject, template.html, template.text);
  }

  async sendHiringApplication(email: string, name: string, applyingRole: string): Promise<boolean> {
    const template = EmailTemplates.hiringApplication(name, email, applyingRole);
    return this.send({ to: email, ...template });
  }

  async sendHiringSelected(email: string, name: string, applyingRole: string): Promise<boolean> {
    const template = EmailTemplates.hiringSelected(name, applyingRole);
    return this.send({ to: email, ...template });
  }

  async sendHiringRejected(email: string, name: string, applyingRole: string): Promise<boolean> {
    const template = EmailTemplates.hiringRejected(name, applyingRole);
    return this.send({ to: email, ...template });
  }

  // Network-specific emails (for NETWORK role users only)
  
  // Sent when someone creates/submits their network profile for review
  async sendNetworkWelcome(email: string, name: string, designation: string, company: string, connectionType: string): Promise<boolean> {
    // Format connection type for display
    const connectionLabels: Record<string, string> = {
      GUEST_SPEAKER: 'Guest Speaker',
      GMEET_SESSION: 'GMeet Session Host',
      EVENT_JUDGE: 'Event Judge',
      MENTOR: 'Mentor',
      INDUSTRY_PARTNER: 'Industry Partner',
      ALUMNI: 'Alumni',
      OTHER: 'Network Partner',
    };
    const roleLabel = connectionLabels[connectionType] || 'Network Partner';
    
    const template = {
      subject: `🙏 Thank You for Joining Our Network · code.scriet`,
      html: generateEmailTemplate({
        preheader: `Thank you for being part of the code.scriet network, ${name}!`,
        accentColor: '#f59e0b',
        badge: { text: roleLabel, icon: '✨' },
        title: `Thank You, ${name}!`,
        subtitle: `We're honored to have you in our network.`,
        body: `
          <p style="margin: 0 0 20px; font-size: 16px; color: #e5e7eb; line-height: 1.8;">
            Thank you for being part of the <strong style="color: #fbbf24;">code.scriet</strong> network! Your contribution as a <strong style="color: #10b981;">${roleLabel}</strong> helps inspire and guide the next generation of tech professionals.
          </p>
          
          <div style="padding: 20px; background: linear-gradient(135deg, #f59e0b15, #ea580c10); border: 1px solid #f59e0b30; border-radius: 12px; margin: 20px 0;">
            <p style="margin: 0 0 12px; font-size: 14px; color: #fbbf24; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Your Profile</p>
            <p style="margin: 0; font-size: 18px; color: #ffffff; font-weight: 600;">${designation}</p>
            <p style="margin: 4px 0 0; font-size: 14px; color: #a1a1aa;">${company}</p>
          </div>
          
          <p style="margin: 0 0 20px; font-size: 15px; color: #d1d5db; line-height: 1.7;">
            <strong>What happens next?</strong><br/>
            Our team will review your profile within 24-48 hours. Once verified, your profile will be live on our Network page and you'll receive a confirmation email with your unique profile link.
          </p>
          
          <div style="padding: 20px; background: linear-gradient(135deg, #10b98115, #0ea5e910); border-left: 3px solid #06b6d4; border-radius: 0 12px 12px 0; margin: 20px 0;">
            <p style="margin: 0 0 12px; font-size: 14px; color: #22d3ee; font-weight: 600;">🤝 Help Our Students Grow</p>
            <p style="margin: 0; font-size: 14px; color: #d1d5db; line-height: 1.7;">
              We'd be grateful if you could share any <strong style="color: #ffffff;">internship, job opportunities, or mentorship programs</strong> with our talented students. Your support can make a significant difference in their careers!
            </p>
          </div>
          
          <div style="padding: 16px 20px; background: #18181b; border: 1px solid #27272a; border-radius: 12px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #a1a1aa; line-height: 1.6;">
              💡 <strong style="color: #ffffff;">Tip:</strong> After verification, you can share your profile with your network to showcase your involvement with code.scriet.
            </p>
          </div>
        `,
        cta: { text: 'Learn More About Us', url: `${SITE_URL}/about` },
        footer: 'Thank you for believing in our mission.',
      }),
      text: `Hi ${name}, thank you for joining the code.scriet network as a ${roleLabel}! Your profile as ${designation} at ${company} is pending review. We'll notify you once it's verified.`,
    };
    return this.send({ to: email, ...template });
  }

  // Sent when admin verifies the profile
  async sendNetworkVerified(email: string, name: string, designation: string, company: string, profileId: string): Promise<boolean> {
    const profileUrl = `${SITE_URL}/network/${profileId}`;
    const template = {
      subject: `✅ Your Network Profile is Now Live · code.scriet`,
      html: generateEmailTemplate({
        preheader: `Your professional profile has been verified and is now visible on code.scriet`,
        accentColor: '#10b981',
        badge: { text: 'Profile Verified', icon: '✓' },
        title: `Welcome to Our Network, ${name}!`,
        subtitle: `Your profile as ${designation} at ${company} is now live.`,
        body: `
          <p style="margin: 0 0 20px; font-size: 16px; color: #e5e7eb; line-height: 1.8;">
            Thank you for connecting with <strong style="color: #fbbf24;">code.scriet</strong>! Your professional profile has been reviewed and approved by our team.
          </p>
          
          <p style="margin: 0 0 20px; font-size: 15px; color: #d1d5db; line-height: 1.7;">
            Your profile is now visible on our Network page, showcasing your connection with our community. This helps inspire students and demonstrates the valuable industry connections our club has built.
          </p>
          
          <div style="padding: 16px 20px; background: linear-gradient(135deg, #10b98115, #05966910); border-left: 3px solid #10b981; border-radius: 0 12px 12px 0; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #6ee7b7; line-height: 1.7;">
              <strong>Your public profile:</strong> Share your profile link with your network to showcase your involvement with the next generation of tech professionals.
            </p>
          </div>
        `,
        cta: { text: 'View Your Profile', url: profileUrl },
        footer: 'Thank you for being part of our journey.',
      }),
      text: `Hi ${name}, your profile as ${designation} at ${company} has been verified and is now live on code.scriet! View it here: ${profileUrl}`,
    };
    return this.send({ to: email, ...template });
  }

  async sendNetworkRejected(email: string, name: string, reason?: string): Promise<boolean> {
    const template = {
      subject: `Update on Your Network Profile · code.scriet`,
      html: generateEmailTemplate({
        preheader: `An update regarding your network profile submission`,
        accentColor: '#f59e0b',
        badge: { text: 'Profile Status Update', icon: '○' },
        title: `Hi ${name}`,
        subtitle: `We've reviewed your network profile submission.`,
        body: `
          <p style="margin: 0 0 20px; font-size: 15px; color: #d1d5db; line-height: 1.8;">
            Thank you for your interest in joining the <strong style="color: #fbbf24;">code.scriet</strong> network. After reviewing your submission, we're unable to verify your profile at this time.
          </p>
          
          ${reason ? `
          <div style="padding: 16px 20px; background: #18181b; border: 1px solid #27272a; border-radius: 12px; margin: 20px 0;">
            <p style="margin: 0 0 8px; font-size: 12px; color: #f59e0b; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Feedback</p>
            <p style="margin: 0; font-size: 14px; color: #a1a1aa; line-height: 1.6;">${reason}</p>
          </div>
          ` : ''}
          
          <p style="margin: 0 0 20px; font-size: 15px; color: #d1d5db; line-height: 1.7;">
            If you believe this was in error or would like to provide additional information, please feel free to reach out to us.
          </p>
        `,
        cta: { text: 'Contact Us', url: `${SITE_URL}/about` },
        footer: 'We appreciate your understanding.',
      }),
      text: `Hi ${name}, we've reviewed your network profile submission. Unfortunately, we're unable to verify it at this time.${reason ? ` Feedback: ${reason}` : ''} If you have questions, please contact us.`,
    };
    return this.send({ to: email, ...template });
  }

  // Special email for Alumni with WhatsApp group invitation (only if verified)
  async sendAlumniWelcome(email: string, name: string, designation: string, company: string, isVerified: boolean = false, passoutYear?: number, branch?: string): Promise<boolean> {
    const whatsappInviteLink = isVerified ? (process.env.INVITE_LINK_WH || '') : '';
    const alumniInfo = passoutYear ? `Class of ${passoutYear}${branch ? ` · ${branch}` : ''}` : '';
    
    const template = {
      subject: isVerified ? `✅ Your Alumni Profile is Now Live · code.scriet` : `🎓 Welcome Back, Alumni! · code.scriet`,
      html: generateEmailTemplate({
        preheader: isVerified ? `Your alumni profile has been verified and is now live!` : `Thank you for reconnecting with code.scriet, ${name}!`,
        accentColor: '#f43f5e',
        badge: { text: isVerified ? 'Profile Verified' : 'Alumni Network', icon: isVerified ? '✓' : '🎓' },
        title: isVerified ? `Welcome to Our Network, ${name}!` : `Welcome Back, ${name}!`,
        subtitle: isVerified ? `Your profile as ${designation} at ${company} is now live.` : (alumniInfo || `We're honored to have you in our alumni network.`),
        body: `
          <p style="margin: 0 0 20px; font-size: 16px; color: #e5e7eb; line-height: 1.8;">
            Thank you for reconnecting with <strong style="color: #fbbf24;">code.scriet</strong>! ${isVerified ? 'Your alumni profile has been reviewed and approved by our team.' : "As an alumni, you're a vital part of our growing community, and we're thrilled to have you back."}
          </p>
          
          <div style="padding: 20px; background: linear-gradient(135deg, #f43f5e15, #ec489915); border: 1px solid #f43f5e30; border-radius: 12px; margin: 20px 0;">
            <p style="margin: 0 0 12px; font-size: 14px; color: #fb7185; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Your Profile</p>
            <p style="margin: 0; font-size: 18px; color: #ffffff; font-weight: 600;">${designation}</p>
            <p style="margin: 4px 0 0; font-size: 14px; color: #a1a1aa;">${company}</p>
            ${alumniInfo ? `<p style="margin: 8px 0 0; font-size: 13px; color: #fb7185;">${alumniInfo}</p>` : ''}
          </div>
          
          ${!isVerified ? `
          <p style="margin: 0 0 20px; font-size: 15px; color: #d1d5db; line-height: 1.7;">
            <strong>What happens next?</strong><br/>
            Our team will review your profile within 24-48 hours. Once verified, your profile will be live on our Network page and you'll receive a confirmation email with your unique profile link and WhatsApp group invitation.
          </p>
          ` : `
          <p style="margin: 0 0 20px; font-size: 15px; color: #d1d5db; line-height: 1.7;">
            Your profile is now visible on our Network page, showcasing your journey and connection with our community. This helps inspire current students and demonstrates the success of our alumni!
          </p>
          `}
          
          <div style="padding: 20px; background: linear-gradient(135deg, #10b98115, #0ea5e910); border-left: 3px solid #06b6d4; border-radius: 0 12px 12px 0; margin: 20px 0;">
            <p style="margin: 0 0 12px; font-size: 14px; color: #22d3ee; font-weight: 600;">🤝 Help Our Students Grow</p>
            <p style="margin: 0; font-size: 14px; color: #d1d5db; line-height: 1.7;">
              We'd be grateful if you could share any <strong style="color: #ffffff;">internship, job opportunities, or mentorship programs</strong> from your company or network with our talented students. Your support can make a significant impact on their careers!
            </p>
          </div>
          
          ${whatsappInviteLink ? `
          <div style="padding: 24px; background: linear-gradient(135deg, #25D36620, #128C7E15); border: 2px solid #25D366; border-radius: 12px; margin: 20px 0; text-align: center;">
            <p style="margin: 0 0 8px; font-size: 16px; color: #25D366; font-weight: 700;">🎉 Join Our Alumni Community!</p>
            <p style="margin: 0 0 20px; font-size: 14px; color: #d1d5db; line-height: 1.6;">
              Connect with fellow alumni, stay updated on opportunities, and share your experiences in our exclusive <strong style="color: #ffffff;">Alumni WhatsApp Group</strong>.
            </p>
            <a href="${whatsappInviteLink}" target="_blank" style="display: inline-block; padding: 14px 32px; background: #25D366; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 10px; box-shadow: 0 4px 12px rgba(37, 211, 102, 0.3);">
              Join WhatsApp Group →
            </a>
          </div>
          ` : ''}
          
          ${!isVerified ? `
          <div style="padding: 16px 20px; background: #18181b; border: 1px solid #27272a; border-radius: 12px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #a1a1aa; line-height: 1.6;">
              💡 <strong style="color: #ffffff;">Tip:</strong> After verification, you'll get access to our Alumni WhatsApp Group and can share your profile to showcase your journey!
            </p>
          </div>
          ` : ''}
        `,
        cta: { text: 'Learn More About Us', url: `${SITE_URL}/about` },
        footer: 'Thank you for being part of our story.',
      }),
      text: `Hi ${name}, thank you for reconnecting with code.scriet as an alumni! Your profile as ${designation} at ${company} is pending review. We'll notify you once it's verified.${whatsappInviteLink ? ` Join our Alumni WhatsApp Group: ${whatsappInviteLink}` : ''}`,
    };
    return this.send({ to: email, ...template });
  }

  async sendCertificateIssued(
    email: string,
    name: string,
    eventName: string,
    certId: string,
    downloadUrl: string,
  ): Promise<boolean> {
    const verifyUrl = `${SITE_URL}/verify/${certId}`;
    const template = {
      subject: `🎓 Your Certificate for ${eventName} is Ready!`,
      html: generateEmailTemplate({
        preheader: `Congratulations, ${name}! Your certificate for ${eventName} has been issued.`,
        accentColor: '#fbbf24',
        badge: { text: 'Certificate Issued', icon: '🎓' },
        title: `Congratulations, ${name}!`,
        subtitle: `Your certificate for "${eventName}" has been issued by code.scriet.`,
        infoCards: [
          { icon: '🆔', label: 'Certificate ID', value: certId },
          { icon: '📅', label: 'Issued On', value: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) },
        ],
        body: `
          <p style="margin: 0 0 16px; font-size: 15px; color: #d1d5db; line-height: 1.7;">
            Your participation certificate has been digitally issued and is permanently verifiable. You can download it as a PDF or share the verification link on LinkedIn to showcase your achievement.
          </p>
          <div style="padding: 16px 20px; background: linear-gradient(135deg, #fbbf2415, #f59e0b10); border-left: 3px solid #fbbf24; border-radius: 0 12px 12px 0;">
            <p style="margin: 0; font-size: 13px; color: #fcd34d; line-height: 1.7;">
              <strong>LinkedIn Tip:</strong> Add this certificate to your LinkedIn profile under "Licences & Certifications" using the verify URL below.
            </p>
          </div>
        `,
        cta: { text: '⬇ Download Certificate PDF', url: downloadUrl },
        secondaryCta: { text: '🔍 Verify Certificate', url: verifyUrl },
        footer: 'This certificate is permanently verifiable at codescriet.dev',
      }),
      text: `Hi ${name}, your certificate for ${eventName} is ready! Certificate ID: ${certId}. Download PDF: ${downloadUrl}. Verify at: ${verifyUrl}`,
    };
    return this.send({ to: email, ...template, category: 'certificate' });
  }

  isConfigured(): boolean {
    return this.configured;
  }
}

export const emailService = new EmailService();
