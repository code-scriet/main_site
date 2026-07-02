// Email service for notifications using Brevo (formerly Sendinblue)
// Professional email notifications for code.scriet - The Coding Club

import type { Event, EventInvitation as PrismaEventInvitation, NetworkProfile, User } from '@prisma/client';
import { marked } from 'marked';
import { logger } from './logger.js';
import { prisma } from '../lib/prisma.js';
import { escapeHtml, sanitizeHtml, sanitizeText, sanitizeUrl } from './sanitize.js';
import { signInvitationClaimToken } from './jwt.js';
import {
  applyTestingMode,
  applyTestingModeBulk,
  getNotificationSettings,
  invalidateNotificationSettingsCache as invalidateNotificationSettingsCacheImpl,
  shouldNotify,
  type EmailCategory,
} from './emailPolicy.js';
import {
  deliverBatch,
  deliverSingle,
  isTransportConfigured,
  normalizeEmailList,
  type BrevoRecipient,
  type EmailAttachment,
} from './emailTransport.js';

// Re-export so existing callers (routes/settings.ts, etc.) keep working.
export { invalidateNotificationSettingsCacheImpl as invalidateNotificationSettingsCache };
export type { EmailCategory };

// ============================================
// Email template config cache
// ============================================

// Email template config cache
interface EmailTemplateConfig {
  clubName: string;
  welcomeBody: string;
  announcementIntro: string;
  eventIntro: string;
  footerText: string;
  githubUrl: string | null;
  linkedinUrl: string | null;
  twitterUrl: string | null;
  instagramUrl: string | null;
  discordUrl: string | null;
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
        clubName: true,
        emailWelcomeBody: true,
        emailAnnouncementBody: true,
        emailEventBody: true,
        emailFooterText: true,
        githubUrl: true,
        linkedinUrl: true,
        twitterUrl: true,
        instagramUrl: true,
        discordUrl: true,
      },
    });
    
    emailTemplateConfigCache = {
      clubName: settings?.clubName || 'code.scriet',
      welcomeBody: settings?.emailWelcomeBody || '',
      announcementIntro: settings?.emailAnnouncementBody || '',
      eventIntro: settings?.emailEventBody || '',
      footerText: settings?.emailFooterText || '',
      githubUrl: settings?.githubUrl || null,
      linkedinUrl: settings?.linkedinUrl || null,
      twitterUrl: settings?.twitterUrl || null,
      instagramUrl: settings?.instagramUrl || null,
      discordUrl: settings?.discordUrl || null,
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
      clubName: 'code.scriet',
      welcomeBody: '',
      announcementIntro: '',
      eventIntro: '',
      footerText: '',
      githubUrl: null,
      linkedinUrl: null,
      twitterUrl: null,
      instagramUrl: null,
      discordUrl: null,
    };
  }
}

// Production URL for all email links
export const SITE_URL = (process.env.FRONTEND_URL || 'https://codescriet.dev').replace(/\/+$/, '');

// Reply-to address surfaced inside HTML templates (transport handles the
// header itself via process.env in emailTransport.ts).
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || 'tech_admin@codescriet.dev';

// Configure marked for email-safe HTML
marked.setOptions({
  breaks: true,
  gfm: true,
});

interface EmailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
  inlineImages?: Record<string, string>;
  category?: EmailCategory;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
  inlineImages?: Record<string, string>;
}

export interface EventRegistrationContext {
  teamName?: string;
  teamRole?: 'LEADER' | 'MEMBER' | string;
}

// ============================================
// Markdown to Email HTML Converter
// ============================================

export function markdownToEmailHtml(markdown: string): string {
  const rawHtml = marked.parse(markdown, { async: false }) as string;
  const safeHtml = sanitizeHtml(rawHtml);

  return safeHtml
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

export const emailTemplateTestUtils = {
  markdownToEmailHtml,
};

export function htmlToPlainText(html: string): string {
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

function stripHtmlToText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function formatInvitationDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatInvitationTime(date: Date): string {
  return date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatInvitationDateRange(startDate: Date, endDate?: Date | null): string {
  if (!endDate) {
    return `${formatInvitationDate(startDate)} at ${formatInvitationTime(startDate)}`;
  }

  const sameDay = startDate.toDateString() === endDate.toDateString();
  if (sameDay) {
    return `${formatInvitationDate(startDate)} · ${formatInvitationTime(startDate)} - ${formatInvitationTime(endDate)}`;
  }

  return `${formatInvitationDate(startDate)} ${formatInvitationTime(startDate)} to ${formatInvitationDate(endDate)} ${formatInvitationTime(endDate)}`;
}

function getInvitationSummary(event: Pick<Event, 'shortDescription' | 'description'>): string {
  const summarySource = event.shortDescription?.trim() || stripHtmlToText(event.description);
  return sanitizeText(truncateText(summarySource, 300));
}

function formatCustomMessageBlock(message?: string | null): string {
  if (!message?.trim()) {
    return '';
  }

  const safeMessage = escapeHtml(sanitizeText(message)).replace(/\n/g, '<br />');
  return `
    <tr>
      <td style="padding: 0 32px 28px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left: 4px solid #c7a34d; background: #fff8ee; border-radius: 0 16px 16px 0;">
          <tr>
            <td style="padding: 18px 20px; font-size: 15px; line-height: 1.8; color: #5f3f2d;">
              ${safeMessage}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

function getInvitationSocialLinks(config: Pick<EmailTemplateConfig, 'githubUrl' | 'linkedinUrl' | 'twitterUrl' | 'instagramUrl' | 'discordUrl'>) {
  return [
    ['GitHub', config.githubUrl],
    ['LinkedIn', config.linkedinUrl],
    ['Twitter', config.twitterUrl],
    ['Instagram', config.instagramUrl],
    ['Discord', config.discordUrl],
  ]
    .filter(([, url]) => Boolean(url))
    .map(([label, url]) => ({ label, url: url! }));
}

type EventInvitationEmailContext = PrismaEventInvitation & {
  event: Pick<
    Event,
    'title' | 'description' | 'shortDescription' | 'startDate' | 'endDate' | 'venue' | 'location' | 'imageUrl' | 'eventType'
  >;
  inviteeUser?: (
    Pick<User, 'email' | 'name'> & {
      networkProfile?: Pick<NetworkProfile, 'fullName' | 'designation' | 'company'> | null;
    }
  ) | null;
};

function buildInvitationEmailTemplate(
  invitation: EventInvitationEmailContext,
  config: EmailTemplateConfig,
  action: { text: string; url: string },
): EmailTemplate {
  const inviteeProfile = invitation.inviteeUser?.networkProfile || null;
  const fullName = sanitizeText(
    inviteeProfile?.fullName ||
      invitation.inviteeNameSnapshot ||
      invitation.inviteeUser?.name ||
      'Guest',
  );
  const designation = sanitizeText(inviteeProfile?.designation || invitation.inviteeDesignationSnapshot || '');
  const role = sanitizeText(invitation.role || 'Guest');
  const clubName = sanitizeText(config.clubName || 'code.scriet');
  const eventTitle = sanitizeText(invitation.event.title);
  const eventVenue = sanitizeText(invitation.event.venue || 'Venue to be announced');
  const eventLocation = sanitizeText(invitation.event.location || 'Location to be announced');
  const eventType = sanitizeText(invitation.event.eventType || 'Club Event');
  const greetingName = fullName === 'Guest'
    ? 'Guest'
    : `${designation ? `${designation} ` : ''}${fullName}`.trim();
  const leadParagraph = `${clubName} cordially invites you to be a ${role} at our upcoming event, ${eventTitle}.`;
  const summary = getInvitationSummary(invitation.event);
  const socialLinks = getInvitationSocialLinks(config);
  const socialLinksHtml = socialLinks.length > 0
    ? socialLinks
        .map(({ label, url }) => {
          const safeUrl = sanitizeUrl(url);
          if (!safeUrl) return '';
          return `<a href="${escapeHtml(safeUrl)}" style="color: #8a5a3c; text-decoration: none; margin: 0 8px; font-weight: 600;">${escapeHtml(label)}</a>`;
        })
        .filter(Boolean)
        .join('<span style="color: #b8a48a;">•</span>')
    : '';
  const socialLinksText = socialLinks.length > 0
    ? `\n\nConnect with us: ${socialLinks.map(({ label, url }) => `${label}: ${url}`).join(' | ')}`
    : '';
  const footerText = sanitizeText(config.footerText || '');
  const safeActionUrl = sanitizeUrl(action.url);
  const safeEventImageUrl = sanitizeUrl(invitation.event.imageUrl || '');
  const heroSection = safeEventImageUrl
    ? `<img src="${escapeHtml(safeEventImageUrl)}" alt="${escapeHtml(eventTitle)}" style="display: block; width: 100%; height: auto; max-height: 260px; object-fit: cover;" />`
    : `
      <div style="padding: 42px 32px; background: linear-gradient(135deg, #5e0f19 0%, #8d2236 48%, #d4a949 100%);">
        <div style="font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: #fbe8b6; font-weight: 700; margin-bottom: 12px;">${escapeHtml(clubName)}</div>
        <div style="font-family: Georgia, 'Times New Roman', serif; font-size: 34px; line-height: 1.2; color: #fffaf0; font-weight: 700;">${escapeHtml(eventTitle)}</div>
        <div style="margin-top: 12px; font-size: 15px; color: #fde9be; line-height: 1.7;">A formal invitation from ${escapeHtml(clubName)}</div>
      </div>
    `;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(eventTitle)}</title>
</head>
<body style="margin: 0; padding: 0; background: #f6efe4; color: #2f2118;">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">
    You're invited to ${escapeHtml(eventTitle)} as our ${escapeHtml(role)}.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f6efe4;">
    <tr>
      <td align="center" style="padding: 28px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background: #fffaf3; border: 1px solid #ead8b7; border-radius: 24px; overflow: hidden;">
          <tr>
            <td style="padding: 24px 28px; background: #fff5df; border-bottom: 1px solid #ecdab6; text-align: center;">
              <div style="font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: #8a5a3c; font-weight: 700;">${escapeHtml(clubName)}</div>
              <div style="margin-top: 8px; font-family: Georgia, 'Times New Roman', serif; font-size: 30px; color: #5e0f19; font-weight: 700;">Invitation</div>
            </td>
          </tr>
          <tr>
            <td>${heroSection}</td>
          </tr>
          <tr>
            <td style="padding: 32px 32px 18px 32px;">
              <div style="display: inline-block; padding: 8px 14px; background: #f2e2b7; border-radius: 999px; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #7b542f; font-weight: 700;">
                ${escapeHtml(role)}
              </div>
              <h1 style="margin: 18px 0 14px; font-family: Georgia, 'Times New Roman', serif; font-size: 34px; line-height: 1.18; color: #5e0f19;">
                Dear ${escapeHtml(greetingName)},
              </h1>
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.85; color: #4d3527;">
                ${escapeHtml(leadParagraph)}
              </p>
              <p style="margin: 0; font-size: 15px; line-height: 1.8; color: #6b4b35;">
                ${escapeHtml(summary)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 28px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #fff1d7; border: 1px solid #ebd2a0; border-radius: 18px;">
                <tr>
                  <td style="padding: 18px 20px; border-bottom: 1px solid #edd8af;">
                    <div style="font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #8a5a3c; font-weight: 700; margin-bottom: 6px;">Date</div>
                    <div style="font-size: 16px; line-height: 1.7; color: #4d3527;">${escapeHtml(formatInvitationDateRange(invitation.event.startDate, invitation.event.endDate))}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 18px 20px; border-bottom: 1px solid #edd8af;">
                    <div style="font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #8a5a3c; font-weight: 700; margin-bottom: 6px;">Venue</div>
                    <div style="font-size: 16px; line-height: 1.7; color: #4d3527;">${escapeHtml(eventVenue)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 18px 20px; border-bottom: 1px solid #edd8af;">
                    <div style="font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #8a5a3c; font-weight: 700; margin-bottom: 6px;">Location</div>
                    <div style="font-size: 16px; line-height: 1.7; color: #4d3527;">${escapeHtml(eventLocation)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 18px 20px;">
                    <div style="font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #8a5a3c; font-weight: 700; margin-bottom: 6px;">Event Type</div>
                    <div style="font-size: 16px; line-height: 1.7; color: #4d3527;">${escapeHtml(eventType)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${formatCustomMessageBlock(invitation.customMessage)}
          <tr>
            <td align="center" style="padding: 0 32px 36px 32px;">
              <a href="${escapeHtml(safeActionUrl)}" style="display: inline-block; background: linear-gradient(135deg, #8f6a1d 0%, #d4a949 100%); color: #2f2118; text-decoration: none; font-size: 14px; font-weight: 700; letter-spacing: 0.5px; padding: 16px 30px; border-radius: 999px;">
                ${escapeHtml(action.text)}
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <div style="height: 1px; background: #ead8b7;"></div>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px 32px; text-align: center;">
              <div style="font-family: Georgia, 'Times New Roman', serif; font-size: 20px; color: #5e0f19; font-weight: 700;">${escapeHtml(clubName)}</div>
              ${socialLinksHtml ? `<div style="margin-top: 16px; font-size: 13px; line-height: 1.8;">${socialLinksHtml}</div>` : ''}
              ${footerText ? `<div style="margin-top: 16px; font-size: 13px; line-height: 1.8; color: #7a5f4a;">${escapeHtml(footerText)}</div>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Dear ${greetingName},`,
    '',
    leadParagraph,
    '',
    summary,
    '',
    `Date: ${formatInvitationDateRange(invitation.event.startDate, invitation.event.endDate)}`,
    `Venue: ${eventVenue}`,
    `Location: ${eventLocation}`,
    `Event Type: ${eventType}`,
    invitation.customMessage?.trim() ? ['', `Message: ${invitation.customMessage.trim()}`] : [],
    '',
    `${action.text}: ${action.url}`,
    '',
    `${clubName}${footerText ? `\n${footerText}` : ''}${socialLinksText}`,
  ]
    .flat()
    .join('\n');

  return {
    subject: `You're invited to ${eventTitle}`,
    html,
    text,
  };
}

function buildInvitationWithdrawalEmailTemplate(
  invitation: EventInvitationEmailContext,
  config: EmailTemplateConfig,
): EmailTemplate {
  const clubName = sanitizeText(config.clubName || 'code.scriet');
  const eventTitle = sanitizeText(invitation.event.title);
  const inviteeProfile = invitation.inviteeUser?.networkProfile || null;
  const fullName = sanitizeText(
    inviteeProfile?.fullName ||
      invitation.inviteeNameSnapshot ||
      invitation.inviteeUser?.name ||
      'Guest',
  );
  const role = sanitizeText(invitation.role || 'Guest');
  const footerText = sanitizeText(config.footerText || '');

  return {
    subject: `Update regarding your invitation to ${eventTitle}`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(eventTitle)}</title>
</head>
<body style="margin: 0; padding: 0; background: #f6efe4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f6efe4;">
    <tr>
      <td align="center" style="padding: 28px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background: #fffaf3; border: 1px solid #ead8b7; border-radius: 24px;">
          <tr>
            <td style="padding: 32px;">
              <div style="font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: #8a5a3c; font-weight: 700; margin-bottom: 14px;">${escapeHtml(clubName)}</div>
              <h1 style="margin: 0 0 16px; font-family: Georgia, 'Times New Roman', serif; font-size: 30px; line-height: 1.2; color: #5e0f19;">Invitation update</h1>
              <p style="margin: 0 0 14px; font-size: 16px; line-height: 1.85; color: #4d3527;">
                Dear ${escapeHtml(fullName)}, your invitation to serve as ${escapeHtml(role)} for ${escapeHtml(eventTitle)} has been withdrawn.
              </p>
              <p style="margin: 0; font-size: 15px; line-height: 1.8; color: #6b4b35;">
                We remain grateful for your time and consideration. Please feel free to reach out if you need any clarification from the ${escapeHtml(clubName)} team.
              </p>
              ${footerText ? `<p style="margin: 24px 0 0; font-size: 13px; line-height: 1.8; color: #7a5f4a;">${escapeHtml(footerText)}</p>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    text: `Dear ${fullName},\n\nYour invitation to serve as ${role} for ${eventTitle} has been withdrawn.\n\nWe remain grateful for your time and consideration. Please feel free to reach out if you need any clarification from the ${clubName} team.${footerText ? `\n\n${footerText}` : ''}`,
  };
}

// ============================================
// Premium Email Template
// Stunning, Professional Design
// ============================================

export const generateEmailTemplate = (content: {
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

// Template bodies were extracted to ./emailTemplates.ts in May 2026 to
// keep this file focused on transport orchestration. We import locally
// (the EmailService methods below dispatch through it) AND re-export so
// the historical `import { EmailTemplates } from './email.js'` path
// across the rest of the codebase keeps working.
import { EmailTemplates } from './emailTemplates.js';
export { EmailTemplates };

// ============================================
// Faculty "Note of Appreciation" certificate email
// ============================================

// Light maroon/gold appreciation layout used when the bulk certificate
// generator's email template is set to "Faculty Certificate Distribution".
// All interpolated values are pre-sanitized by the builder below.

const CERTIFICATE_TYPE_LABEL: Record<string, string> = {
  PARTICIPATION: 'Certificate of Participation',
  COMPLETION: 'Certificate of Completion',
  WINNER: 'Certificate of Achievement',
  SPEAKER: 'Certificate of Appreciation',
  APPRECIATION: 'Certificate of Appreciation',
};

function certificateTypeLabel(certType?: string | null): string {
  const key = (certType || '').toUpperCase();
  return CERTIFICATE_TYPE_LABEL[key] || 'Certificate of Participation';
}

// Render a plain-text description (sanitized) into one or more <p> blocks,
// splitting on blank lines and converting single newlines to <br>.
function renderAppreciationParagraphs(description?: string | null): string {
  const safe = sanitizeText(description || '').trim();
  if (!safe) return '';
  return safe
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 18px 0;">${block.replace(/\n/g, '<br>')}</p>`,
    )
    .join('\n');
}

interface FacultyAppreciationEmailParams {
  name: string;
  eventName: string;
  downloadUrl: string;
  verifyUrl: string;
  description?: string | null;
  signerName?: string | null;
  certType?: string | null;
}

function buildFacultyAppreciationEmailHtml(params: FacultyAppreciationEmailParams): string {
  const safeName = sanitizeText(params.name);
  const safeEventName = sanitizeText(params.eventName);
  const signerName = sanitizeText(params.signerName?.trim() || 'PRINCE GUPTA');
  const certLabel = sanitizeText(certificateTypeLabel(params.certType));
  const downloadUrl = sanitizeUrl(params.downloadUrl);
  const verifyUrl = sanitizeUrl(params.verifyUrl);
  const descriptionHtml = renderAppreciationParagraphs(params.description);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>A Note of Appreciation from Code.SCRIET</title>
</head>
<body style="margin:0; padding:0; background-color:#1a1410; font-family: Georgia, 'Times New Roman', serif;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1a1410; padding:40px 16px;">
  <tr>
    <td align="center">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%; background-color:#faf6ee; border:1px solid #c4a86a; border-radius:2px;">

        <!-- Logo header -->
        <tr>
          <td style="padding:36px 32px 20px 32px; text-align:center; background-color:#faf6ee;">
            <img src="https://res.cloudinary.com/da5r9juak/image/upload/v1779877672/club-events/uemt8sgxcrbuybqs0cxi.png"
                 alt="Code.SCRIET"
                 width="80"
                 height="80"
                 style="display:inline-block; border:0; outline:none; text-decoration:none; max-width:80px; height:auto;">
          </td>
        </tr>

        <!-- Maroon band -->
        <tr>
          <td style="background-color:#7a1f1f; padding:14px 32px; text-align:center;">
            <p style="margin:0; font-family: Georgia, serif; font-size:11px; letter-spacing:3px; color:#f5e6c4; text-transform:uppercase;">
              Code.SCRIET &nbsp;&middot;&nbsp; SCRIET, CCSU Meerut
            </p>
          </td>
        </tr>

        <!-- Header -->
        <tr>
          <td style="padding:36px 48px 8px 48px; text-align:center;">
            <p style="margin:0 0 6px 0; font-family: Georgia, serif; font-size:11px; letter-spacing:4px; color:#7a1f1f; text-transform:uppercase;">
              With Gratitude
            </p>
            <h1 style="margin:0; font-family: Georgia, 'Times New Roman', serif; font-size:30px; font-weight:normal; color:#1a1410; line-height:1.2;">
              A Note of Appreciation
            </h1>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:20px auto;">
              <tr>
                <td style="border-bottom:1px solid #c4a86a; width:80px; height:1px; font-size:0; line-height:0;">&nbsp;</td>
                <td style="padding:0 10px; color:#c4a86a; font-size:14px;">&#9670;</td>
                <td style="border-bottom:1px solid #c4a86a; width:80px; height:1px; font-size:0; line-height:0;">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:8px 56px 32px 56px; font-family: Georgia, serif; color:#2b2218; font-size:16px; line-height:1.7;">

            <p style="margin:0 0 18px 0;">
              Respected <strong>${safeName}</strong>,
            </p>

            <p style="margin:0 0 18px 0;">
              On behalf of Code.SCRIET, we wish to extend our sincere gratitude ${safeEventName ? `for gracing <em>&ldquo;${safeEventName}&rdquo;</em>` : 'for your gracious presence and support'}.
            </p>
${descriptionHtml ? `\n            ${descriptionHtml}\n` : ''}
            <p style="margin:0 0 18px 0;">
              The presence of esteemed faculty members such as yourself lends weight and credibility to student initiatives, and we are genuinely thankful for the encouragement it offers our community.
            </p>

            <p style="margin:0 0 8px 0;">
              As a small token of our appreciation, please find your <strong>${certLabel}</strong> below.
            </p>

          </td>
        </tr>

        <!-- Action buttons -->
        <tr>
          <td style="padding:8px 56px 32px 56px;" align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
              <tr>
                <td style="padding:6px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="background-color:#7a1f1f; border-radius:2px;" align="center">
                        <a href="${downloadUrl}"
                           target="_blank"
                           style="display:inline-block; padding:14px 28px; font-family: Georgia, serif; font-size:13px; font-weight:bold; letter-spacing:2px; color:#faf6ee; text-decoration:none; text-transform:uppercase; border:1px solid #7a1f1f;">
                          Download Certificate
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>

                <td style="padding:6px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="background-color:#faf6ee; border-radius:2px;" align="center">
                        <a href="${verifyUrl}"
                           target="_blank"
                           style="display:inline-block; padding:13px 27px; font-family: Georgia, serif; font-size:13px; font-weight:bold; letter-spacing:2px; color:#7a1f1f; text-decoration:none; text-transform:uppercase; border:1px solid #7a1f1f;">
                          Verify Certificate
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Signature -->
        <tr>
          <td style="padding:0 56px 40px 56px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-top:1px solid #d8c89a; padding-top:20px; font-family: Georgia, serif; color:#2b2218; font-size:15px; line-height:1.6;">
                  <p style="margin:0 0 4px 0;">With warm regards,</p>
                  <p style="margin:14px 0 2px 0; font-weight:bold; color:#7a1f1f; letter-spacing:1px;">${signerName}</p>
                  <p style="margin:0; font-style:italic; font-size:13px; color:#6b5a3f;">President, Code.SCRIET</p>
                  <p style="margin:2px 0 0 0; font-style:italic; font-size:13px; color:#6b5a3f;">SCRIET, Chaudhary Charan Singh University, Meerut</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#f0e8d4; padding:16px 32px; text-align:center; border-top:1px solid #c4a86a;">
            <p style="margin:0; font-family: Georgia, serif; font-size:11px; color:#6b5a3f; letter-spacing:2px;">
              codescriet.dev &nbsp;&middot;&nbsp; Code.SCRIET Coding Community
            </p>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>`;
}

// ============================================
// Brevo Email Service Implementation
// ============================================

class EmailService {
  private configured: boolean;

  constructor() {
    this.configured = isTransportConfigured();
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

    // ── Notification guard: category toggle + testing-mode redirect ──
    const category = options.category || 'other';
    const ns = await getNotificationSettings();

    if (!shouldNotify(category, ns)) {
      logger.info('📧 Email suppressed by notification toggle', {
        category,
        to: Array.isArray(options.to) ? `${(options.to as string[]).length} recipients` : options.to,
        subject: options.subject,
      });
      return false;
    }

    const testing = applyTestingMode(options.to, category, ns);
    if (testing.redirect) {
      if (!testing.result.ok) {
        logger.warn('📧 Email testing mode active but no test recipients configured — suppressing', {
          category,
          originalTo: testing.result.originalRecipients,
          subject: options.subject,
        });
        return false;
      }
      logger.info('📧 Email testing mode: redirecting email', {
        category,
        originalRecipients: testing.result.originalRecipients.slice(0, 20),
        originalCount: testing.result.originalRecipients.length,
        redirectedTo: testing.result.testRecipients,
        subject: options.subject,
      });
      options.subject = `[TEST] ${options.subject}`;
      options.to = testing.result.testRecipients;
      options.cc = undefined;
      options.bcc = undefined;
      options.html = testing.result.debugBanner + options.html;
    }

    const normalizedTo = normalizeEmailList(options.to);
    const normalizedCc = normalizeEmailList(options.cc);
    const normalizedBcc = normalizeEmailList(options.bcc);

    if (!normalizedTo.valid || normalizedTo.values.length === 0 || !normalizedCc.valid || !normalizedBcc.valid) {
      logger.warn('Invalid recipient email address in send()', {
        to: options.to,
        cc: options.cc,
        bcc: options.bcc,
      });
      return false;
    }

    const recipients: BrevoRecipient[] = normalizedTo.values.map(email => ({ email }));
    const ccRecipients: BrevoRecipient[] = normalizedCc.values.map(email => ({ email }));
    const bccRecipients: BrevoRecipient[] = normalizedBcc.values.map(email => ({ email }));

    return deliverSingle({
      to: recipients,
      cc: ccRecipients.length > 0 ? ccRecipients : undefined,
      bcc: bccRecipients.length > 0 ? bccRecipients : undefined,
      subject: options.subject,
      htmlContent: options.html,
      textContent: options.text || htmlToPlainText(options.html),
      attachments: options.attachments,
      inlineImages: options.inlineImages,
    });
  }

  async sendBulk(emails: string[], subject: string, html: string, text?: string, category: EmailCategory = 'other'): Promise<boolean> {
    if (!this.configured || emails.length === 0) return false;

    const normalizedEmails = normalizeEmailList(emails);
    if (!normalizedEmails.valid || normalizedEmails.values.length === 0) {
      logger.warn('Invalid recipient email address in sendBulk()', {
        sample: emails.slice(0, 10),
      });
      return false;
    }

    // ── Notification guard: category toggle + testing-mode redirect ──
    const ns = await getNotificationSettings();

    if (!shouldNotify(category, ns)) {
      logger.info('📧 Bulk email suppressed by notification toggle', {
        category,
        recipientCount: normalizedEmails.values.length,
        subject,
      });
      return false;
    }

    const testing = applyTestingModeBulk(normalizedEmails.values.length, category, ns);
    if (testing.redirect) {
      if (!testing.result.ok) {
        logger.warn('📧 Bulk email testing mode active but no test recipients — suppressing', {
          category,
          originalCount: normalizedEmails.values.length,
          subject,
        });
        return false;
      }
      logger.info('📧 Bulk email testing mode: redirecting', {
        category,
        originalCount: normalizedEmails.values.length,
        redirectedTo: testing.result.testRecipients,
        subject,
      });
      return this.send({
        to: testing.result.testRecipients,
        subject: `[TEST] ${subject}`,
        html: testing.result.debugBanner + html,
        text: `[TEST MODE - Would send to ${normalizedEmails.values.length} recipients] ${text || ''}`,
      });
    }

    const BATCH_SIZE = 1000;
    const batches: string[][] = [];
    for (let i = 0; i < normalizedEmails.values.length; i += BATCH_SIZE) {
      batches.push(normalizedEmails.values.slice(i, i + BATCH_SIZE));
    }

    logger.info(`📧 Sending bulk email to ${normalizedEmails.values.length} recipients in ${batches.length} batches`);

    let allSuccessful = true;
    for (const batch of batches) {
      const success = await deliverBatch({
        emails: batch,
        subject,
        htmlContent: html,
        textContent: text || htmlToPlainText(html),
      });
      if (!success) allSuccessful = false;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return allSuccessful;
  }

  // Convenience methods
  async sendWelcome(email: string, name: string, clubName: string = 'code.scriet'): Promise<boolean> {
    const config = await getEmailTemplateConfig();
    const safeName = sanitizeText(name);
    const safeClubName = sanitizeText(clubName);
    const template = EmailTemplates.welcome(safeName, safeClubName, config.welcomeBody, config.footerText);
    return this.send({ to: email, ...template, category: 'welcome' });
  }

  async sendEventRegistration(
    email: string,
    name: string,
    eventTitle: string,
    eventDate: Date,
    eventSlug: string,
    location?: string,
    imageUrl?: string,
    attendanceToken?: string,
    context?: EventRegistrationContext
  ): Promise<boolean> {
    const safeName = sanitizeText(name);
    const safeEventTitle = sanitizeText(eventTitle);
    const safeLocation = location ? sanitizeText(location) : undefined;
    const safeContext = context
      ? {
          ...context,
          teamName: context.teamName ? sanitizeText(context.teamName) : context.teamName,
        }
      : undefined;
    const template = await EmailTemplates.eventRegistration(
      safeName,
      safeEventTitle,
      eventDate,
      eventSlug,
      safeLocation,
      imageUrl,
      attendanceToken,
      safeContext,
    );
    return this.send({ to: email, ...template, category: 'registration' });
  }

  async sendAnnouncementToAll(emails: string[], title: string, body: string, priority: string, slug: string, shortDescription?: string, imageUrl?: string, tags?: string[]): Promise<boolean> {
    const config = await getEmailTemplateConfig();
    const template = EmailTemplates.newAnnouncement(title, body, priority, slug, shortDescription, imageUrl, tags, config.announcementIntro, config.footerText);
    return this.sendBulk(emails, template.subject, template.html, template.text, 'announcement');
  }

  async sendPollToAll(
    emails: string[],
    question: string,
    slug: string,
    description?: string,
    deadline?: Date | null,
    allowMultipleChoices?: boolean,
  ): Promise<boolean> {
    const config = await getEmailTemplateConfig();
    const template = EmailTemplates.newPoll(
      question,
      slug,
      description,
      deadline,
      allowMultipleChoices,
      config.announcementIntro,
      config.footerText,
    );
    return this.sendBulk(emails, template.subject, template.html, template.text, 'announcement');
  }

  async sendNewEventToAll(emails: string[], title: string, description: string, startDate: Date, slug: string, shortDescription?: string, location?: string, imageUrl?: string, tags?: string[], eventType?: string): Promise<boolean> {
    const config = await getEmailTemplateConfig();
    const template = EmailTemplates.newEvent(title, description, startDate, slug, shortDescription, location, imageUrl, tags, eventType, config.eventIntro, config.footerText);
    return this.sendBulk(emails, template.subject, template.html, template.text, 'event_creation');
  }

  async sendEventInvitation(invitation: EventInvitationEmailContext): Promise<boolean> {
    const recipientEmail = invitation.inviteeUser?.email || invitation.inviteeEmail;
    if (!recipientEmail) {
      logger.warn('Skipped invitation email because invitation has no recipient email', {
        invitationId: invitation.id,
        eventId: invitation.eventId,
      });
      return false;
    }

    const config = await getEmailTemplateConfig();
    const action = invitation.inviteeUserId
      ? {
          text: 'View Invitation',
          url: `${SITE_URL}/dashboard/invitations/${invitation.id}`,
        }
      : {
          text: 'Register & Respond',
          url: `${SITE_URL}/join-our-network?invitation=${encodeURIComponent(
            signInvitationClaimToken({
              invitationId: invitation.id,
              email: invitation.inviteeEmail || recipientEmail,
            }),
          )}`,
        };
    const template = buildInvitationEmailTemplate(invitation, config, action);
    return this.send({ to: recipientEmail, ...template, category: 'invitation' });
  }

  async sendEventInvitationWithdrawn(invitation: EventInvitationEmailContext): Promise<boolean> {
    const recipientEmail = invitation.inviteeUser?.email || invitation.inviteeEmail;
    if (!recipientEmail) {
      logger.warn('Skipped withdrawn invitation email because invitation has no recipient email', {
        invitationId: invitation.id,
        eventId: invitation.eventId,
      });
      return false;
    }

    const config = await getEmailTemplateConfig();
    const template = buildInvitationWithdrawalEmailTemplate(invitation, config);
    return this.send({ to: recipientEmail, ...template, category: 'invitation' });
  }

  async sendEventReminder(email: string, name: string, eventTitle: string, eventDate: Date, eventSlug: string): Promise<boolean> {
    const template = EmailTemplates.eventReminder(sanitizeText(name), sanitizeText(eventTitle), eventDate, eventSlug);
    return this.send({ to: email, ...template, category: 'reminder' });
  }

  async sendRegistrationOpens(emails: string[], eventTitle: string, startDate: Date, slug: string, shortDescription?: string, imageUrl?: string): Promise<boolean> {
    const template = EmailTemplates.registrationOpens(
      sanitizeText(eventTitle),
      startDate,
      slug,
      shortDescription ? sanitizeText(shortDescription) : undefined,
      imageUrl,
    );
    // Governed by the same admin toggle as "new event created" emails (event_creation).
    return this.sendBulk(emails, template.subject, template.html, template.text, 'event_creation');
  }

  // S-11 — event changed / cancelled notice to registrants.
  async sendEventUpdate(emails: string[], eventTitle: string, slug: string, kind: 'updated' | 'cancelled', summary: string): Promise<boolean> {
    const template = EmailTemplates.eventUpdate(sanitizeText(eventTitle), slug, kind, sanitizeText(summary));
    return this.sendBulk(emails, template.subject, template.html, template.text, 'event_creation');
  }

  // S-10 — post-event "thanks for coming + feedback" request to attendees.
  async sendEventFeedback(emails: string[], eventTitle: string, pollSlug: string): Promise<boolean> {
    const template = EmailTemplates.eventFeedback(sanitizeText(eventTitle), pollSlug);
    return this.sendBulk(emails, template.subject, template.html, template.text, 'event_creation');
  }

  async sendHiringApplication(email: string, name: string, applyingRole: string): Promise<boolean> {
    const template = EmailTemplates.hiringApplication(sanitizeText(name), email, sanitizeText(applyingRole));
    return this.send({ to: email, ...template });
  }

  async sendHiringSelected(email: string, name: string, applyingRole: string): Promise<boolean> {
    const template = EmailTemplates.hiringSelected(sanitizeText(name), sanitizeText(applyingRole));
    return this.send({ to: email, ...template });
  }

  async sendHiringRejected(email: string, name: string, applyingRole: string): Promise<boolean> {
    const template = EmailTemplates.hiringRejected(sanitizeText(name), sanitizeText(applyingRole));
    return this.send({ to: email, ...template });
  }

  // Network-specific emails (for NETWORK role users only)
  
  // Sent when someone creates/submits their network profile for review
  async sendNetworkWelcome(email: string, name: string, designation: string, company: string, connectionType: string): Promise<boolean> {
    const safeName = sanitizeText(name);
    const safeDesignation = sanitizeText(designation);
    const safeCompany = sanitizeText(company);
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
        preheader: `Thank you for being part of the code.scriet network, ${safeName}!`,
        accentColor: '#f59e0b',
        badge: { text: roleLabel, icon: '✨' },
        title: `Thank You, ${safeName}!`,
        subtitle: `We're honored to have you in our network.`,
        body: `
          <p style="margin: 0 0 20px; font-size: 16px; color: #e5e7eb; line-height: 1.8;">
            Thank you for being part of the <strong style="color: #fbbf24;">code.scriet</strong> network! Your contribution as a <strong style="color: #10b981;">${roleLabel}</strong> helps inspire and guide the next generation of tech professionals.
          </p>
          
          <div style="padding: 20px; background: linear-gradient(135deg, #f59e0b15, #ea580c10); border: 1px solid #f59e0b30; border-radius: 12px; margin: 20px 0;">
            <p style="margin: 0 0 12px; font-size: 14px; color: #fbbf24; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Your Profile</p>
            <p style="margin: 0; font-size: 18px; color: #ffffff; font-weight: 600;">${safeDesignation}</p>
            <p style="margin: 4px 0 0; font-size: 14px; color: #a1a1aa;">${safeCompany}</p>
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
      text: `Hi ${safeName}, thank you for joining the code.scriet network as a ${roleLabel}! Your profile as ${safeDesignation} at ${safeCompany} is pending review. We'll notify you once it's verified.`,
    };
    return this.send({ to: email, ...template });
  }

  // Sent when admin verifies the profile
  async sendNetworkVerified(email: string, name: string, designation: string, company: string, profileId: string): Promise<boolean> {
    const safeName = sanitizeText(name);
    const safeDesignation = sanitizeText(designation);
    const safeCompany = sanitizeText(company);
    const profileUrl = `${SITE_URL}/network/${profileId}`;
    const template = {
      subject: `✅ Your Network Profile is Now Live · code.scriet`,
      html: generateEmailTemplate({
        preheader: `Your professional profile has been verified and is now visible on code.scriet`,
        accentColor: '#10b981',
        badge: { text: 'Profile Verified', icon: '✓' },
        title: `Welcome to Our Network, ${safeName}!`,
        subtitle: `Your profile as ${safeDesignation} at ${safeCompany} is now live.`,
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
      text: `Hi ${safeName}, your profile as ${safeDesignation} at ${safeCompany} has been verified and is now live on code.scriet! View it here: ${profileUrl}`,
    };
    return this.send({ to: email, ...template });
  }

  async sendNetworkRejected(email: string, name: string, reason?: string): Promise<boolean> {
    const safeName = sanitizeText(name);
    const safeReason = reason ? sanitizeText(reason) : undefined;
    const template = {
      subject: `Update on Your Network Profile · code.scriet`,
      html: generateEmailTemplate({
        preheader: `An update regarding your network profile submission`,
        accentColor: '#f59e0b',
        badge: { text: 'Profile Status Update', icon: '○' },
        title: `Hi ${safeName}`,
        subtitle: `We've reviewed your network profile submission.`,
        body: `
          <p style="margin: 0 0 20px; font-size: 15px; color: #d1d5db; line-height: 1.8;">
            Thank you for your interest in joining the <strong style="color: #fbbf24;">code.scriet</strong> network. After reviewing your submission, we're unable to verify your profile at this time.
          </p>
          
          ${safeReason ? `
          <div style="padding: 16px 20px; background: #18181b; border: 1px solid #27272a; border-radius: 12px; margin: 20px 0;">
            <p style="margin: 0 0 8px; font-size: 12px; color: #f59e0b; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Feedback</p>
            <p style="margin: 0; font-size: 14px; color: #a1a1aa; line-height: 1.6;">${safeReason}</p>
          </div>
          ` : ''}
          
          <p style="margin: 0 0 20px; font-size: 15px; color: #d1d5db; line-height: 1.7;">
            If you believe this was in error or would like to provide additional information, please feel free to reach out to us.
          </p>
        `,
        cta: { text: 'Contact Us', url: `${SITE_URL}/about` },
        footer: 'We appreciate your understanding.',
      }),
      text: `Hi ${safeName}, we've reviewed your network profile submission. Unfortunately, we're unable to verify it at this time.${safeReason ? ` Feedback: ${safeReason}` : ''} If you have questions, please contact us.`,
    };
    return this.send({ to: email, ...template });
  }

  // Special email for Alumni with WhatsApp group invitation (only if verified)
  async sendAlumniWelcome(email: string, name: string, designation: string, company: string, isVerified: boolean = false, passoutYear?: number, branch?: string): Promise<boolean> {
    const safeName = sanitizeText(name);
    const safeDesignation = sanitizeText(designation);
    const safeCompany = sanitizeText(company);
    const safeBranch = branch ? sanitizeText(branch) : undefined;
    const whatsappInviteLink = isVerified ? (process.env.INVITE_LINK_WH || '') : '';
    const alumniInfo = passoutYear ? `Class of ${passoutYear}${safeBranch ? ` · ${safeBranch}` : ''}` : '';
    
    const template = {
      subject: isVerified ? `✅ Your Alumni Profile is Now Live · code.scriet` : `🎓 Welcome Back, Alumni! · code.scriet`,
      html: generateEmailTemplate({
        preheader: isVerified ? `Your alumni profile has been verified and is now live!` : `Thank you for reconnecting with code.scriet, ${safeName}!`,
        accentColor: '#f43f5e',
        badge: { text: isVerified ? 'Profile Verified' : 'Alumni Network', icon: isVerified ? '✓' : '🎓' },
        title: isVerified ? `Welcome to Our Network, ${safeName}!` : `Welcome Back, ${safeName}!`,
        subtitle: isVerified ? `Your profile as ${safeDesignation} at ${safeCompany} is now live.` : (alumniInfo || `We're honored to have you in our alumni network.`),
        body: `
          <p style="margin: 0 0 20px; font-size: 16px; color: #e5e7eb; line-height: 1.8;">
            Thank you for reconnecting with <strong style="color: #fbbf24;">code.scriet</strong>! ${isVerified ? 'Your alumni profile has been reviewed and approved by our team.' : "As an alumni, you're a vital part of our growing community, and we're thrilled to have you back."}
          </p>
          
          <div style="padding: 20px; background: linear-gradient(135deg, #f43f5e15, #ec489915); border: 1px solid #f43f5e30; border-radius: 12px; margin: 20px 0;">
            <p style="margin: 0 0 12px; font-size: 14px; color: #fb7185; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Your Profile</p>
            <p style="margin: 0; font-size: 18px; color: #ffffff; font-weight: 600;">${safeDesignation}</p>
            <p style="margin: 4px 0 0; font-size: 14px; color: #a1a1aa;">${safeCompany}</p>
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
      text: `Hi ${safeName}, thank you for reconnecting with code.scriet as an alumni! Your profile as ${safeDesignation} at ${safeCompany} is pending review. We'll notify you once it's verified.${whatsappInviteLink ? ` Join our Alumni WhatsApp Group: ${whatsappInviteLink}` : ''}`,
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
    const safeName = sanitizeText(name);
    const safeEventName = sanitizeText(eventName);
    const safeCertId = sanitizeText(certId);
    const verifyUrl = `${SITE_URL}/verify/${certId}`;
    const template = {
      subject: `🎓 Your Certificate for ${safeEventName} is Ready!`,
      html: generateEmailTemplate({
        preheader: `Congratulations, ${safeName}! Your certificate for ${safeEventName} has been issued.`,
        accentColor: '#fbbf24',
        badge: { text: 'Certificate Issued', icon: '🎓' },
        title: `Congratulations, ${safeName}!`,
        subtitle: `Your certificate for "${safeEventName}" has been issued by code.scriet.`,
        infoCards: [
          { icon: '🆔', label: 'Certificate ID', value: safeCertId },
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
      text: `Hi ${safeName}, your certificate for ${safeEventName} is ready! Certificate ID: ${safeCertId}. Download PDF: ${downloadUrl}. Verify at: ${verifyUrl}`,
    };
    return this.send({ to: email, ...template, category: 'certificate' });
  }

  // Faculty "Note of Appreciation" variant of the certificate email — selected via
  // the bulk generator's "Faculty Certificate Distribution" email template.
  async sendCertificateAppreciation(params: {
    email: string;
    name: string;
    eventName: string;
    certId: string;
    downloadUrl: string;
    description?: string | null;
    signerName?: string | null;
    certType?: string | null;
  }): Promise<boolean> {
    const safeName = sanitizeText(params.name);
    const safeEventName = sanitizeText(params.eventName);
    const verifyUrl = `${SITE_URL}/verify/${params.certId}`;
    const html = buildFacultyAppreciationEmailHtml({
      name: params.name,
      eventName: params.eventName,
      downloadUrl: params.downloadUrl,
      verifyUrl,
      description: params.description,
      signerName: params.signerName,
      certType: params.certType,
    });
    return this.send({
      to: params.email,
      subject: `A Note of Appreciation${safeEventName ? ` — ${safeEventName}` : ''}`,
      html,
      text: `Respected ${safeName}, on behalf of Code.SCRIET, thank you for gracing ${safeEventName}. Please find your certificate — Download: ${params.downloadUrl} · Verify: ${verifyUrl}`,
      category: 'certificate',
    });
  }

  async sendPasswordReset(
    email: string,
    name: string,
    resetUrl: string,
    expiresInMinutes: number,
    initiatedBy?: string,
  ): Promise<boolean> {
    const config = await getEmailTemplateConfig();
    const safeName = sanitizeText(name || 'there');
    const safeInitiator = initiatedBy ? sanitizeText(initiatedBy) : null;
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { emailPasswordResetBody: true },
    });
    const customBody = settings?.emailPasswordResetBody ?? null;
    // Default copy depends on who initiated: the admin flow passes initiatedBy,
    // the self-service "forgot password" flow does not.
    const defaultBody = initiatedBy
      ? `An administrator has initiated a password reset for your account. Use the button below to set a new password. The link expires in ${expiresInMinutes} minute(s). If you didn't request this and don't recognise the activity, ignore this email — no change has been made.`
      : `We received a request to reset the password for your account. Use the button below to set a new password. The link expires in ${expiresInMinutes} minute(s). If you didn't request this, ignore this email — no change has been made.`;
    const bodyText = customBody ? sanitizeText(customBody) : defaultBody;

    const html = generateEmailTemplate({
      preheader: `Reset your ${config.clubName} password (expires in ${expiresInMinutes} min)`,
      accentColor: '#dc2626',
      badge: { text: 'Password reset', icon: '🔐' },
      title: `Hi ${safeName},`,
      subtitle: `Set a new password for your ${sanitizeText(config.clubName)} account.`,
      body: `
        <p style="margin: 0 0 16px; font-size: 15px; color: #d1d5db; line-height: 1.7;">${bodyText}</p>
        ${safeInitiator ? `<p style="margin: 0 0 8px; font-size: 13px; color: #9ca3af;">Initiated by ${safeInitiator}.</p>` : ''}
        <div style="padding: 12px 16px; background: rgba(220, 38, 38, 0.08); border-left: 3px solid #dc2626; border-radius: 0 10px 10px 0; margin-top: 12px;">
          <p style="margin: 0; font-size: 13px; color: #fca5a5; line-height: 1.6;">
            <strong>Heads up:</strong> If you didn't expect this email, contact ${sanitizeText(config.clubName)} — your account is still safe until the link is used.
          </p>
        </div>
      `,
      cta: { text: 'Set a new password', url: resetUrl },
      footer: config.footerText,
    });
    const text = `Hi ${safeName},\n\n${bodyText}\n\nReset link: ${resetUrl}\n\nThis link expires in ${expiresInMinutes} minute(s).`;
    return this.send({ to: email, subject: `Reset your ${config.clubName} password`, html, text, category: 'password_reset' });
  }

  isConfigured(): boolean {
    return this.configured;
  }
}

export const emailService = new EmailService();
