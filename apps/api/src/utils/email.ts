// Email service for notifications using Brevo (formerly Sendinblue)
// Professional email notifications for code.scriet - The Coding Club

import { marked } from 'marked';
import { logger } from './logger.js';
import { emailTemplateConfig } from '../config/email-templates.config.js';

// Brevo API configuration
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'code.scriet@codescriet.dev';
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'code.scriet';
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || 'tech_admin@codescriet.dev';

// Production URL for all email links
const SITE_URL = 'https://codescriet.dev';

// Configure marked for email-safe HTML
marked.setOptions({
  breaks: true,
  gfm: true,
});

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
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
  eventRegistration: (name: string, eventTitle: string, eventDate: Date, eventSlug: string, location?: string, imageUrl?: string): EmailTemplate => ({
    subject: `Confirmed · ${eventTitle}`,
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
      `,
      cta: { text: 'View Event Details', url: `${SITE_URL}/events/${eventSlug}` },
      footer: 'The future belongs to those who prepare for it.',
    }),
    text: `Hi ${name}, your registration for ${eventTitle} on ${eventDate.toLocaleDateString()} is confirmed!`,
  }),

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
      text: `New Event: ${title}\n\nDate: ${startDate.toLocaleDateString()}\nTime: ${startDate.toLocaleTimeString()}\n${location ? `Location: ${location}\n` : ''}\n${description}\n\nRegister: ${SITE_URL}/events/${slug}`,
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
    text: `Hi ${name}, reminder: ${eventTitle} is tomorrow at ${eventDate.toLocaleTimeString()}!`,
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
    text: `Registration is now open for ${eventTitle}! Date: ${startDate.toLocaleDateString()}. Register: ${SITE_URL}/events/${slug}`,
  }),

  // Hiring application confirmation
  hiringApplication: (name: string, email: string, applyingRole: string): EmailTemplate => {
    const roleNames: Record<string, string> = {
      TECHNICAL: 'Technical Division',
      DESIGNING: 'Design Division',
      VIDEO_EDITING: 'Media Production Division',
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
      DESIGNING: 'Design Division',
      VIDEO_EDITING: 'Media Production Division',
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
      DESIGNING: 'Design Division',
      VIDEO_EDITING: 'Media Production Division',
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
        subject: options.subject
      });
      return false;
    }

    try {
      const recipients: BrevoRecipient[] = Array.isArray(options.to)
        ? options.to.map(email => ({ email }))
        : [{ email: options.to }];

      const payload = {
        sender: { name: this.fromName, email: this.fromEmail },
        replyTo: { email: this.replyToEmail, name: 'code.scriet Support' },
        to: recipients,
        subject: options.subject,
        htmlContent: options.html,
        textContent: options.text || htmlToPlainText(options.html),
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

  async sendBulk(emails: string[], subject: string, html: string, text?: string): Promise<boolean> {
    if (!this.configured || emails.length === 0) return false;

    const BATCH_SIZE = 50;
    const batches: string[][] = [];
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      batches.push(emails.slice(i, i + BATCH_SIZE));
    }

    logger.info(`📧 Sending bulk email to ${emails.length} recipients in ${batches.length} batches`);

    let allSuccessful = true;
    for (const batch of batches) {
      const success = await this.send({ to: batch, subject, html, text });
      if (!success) allSuccessful = false;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return allSuccessful;
  }

  // Convenience methods
  async sendWelcome(email: string, name: string, clubName: string = 'code.scriet'): Promise<boolean> {
    const template = EmailTemplates.welcome(name, clubName, emailTemplateConfig.welcomeBody, emailTemplateConfig.footerText);
    return this.send({ to: email, ...template });
  }

  async sendEventRegistration(email: string, name: string, eventTitle: string, eventDate: Date, eventSlug: string, location?: string, imageUrl?: string): Promise<boolean> {
    const template = EmailTemplates.eventRegistration(name, eventTitle, eventDate, eventSlug, location, imageUrl);
    return this.send({ to: email, ...template });
  }

  async sendAnnouncementToAll(emails: string[], title: string, body: string, priority: string, slug: string, shortDescription?: string, imageUrl?: string, tags?: string[]): Promise<boolean> {
    const template = EmailTemplates.newAnnouncement(title, body, priority, slug, shortDescription, imageUrl, tags, emailTemplateConfig.announcementIntro, emailTemplateConfig.footerText);
    return this.sendBulk(emails, template.subject, template.html, template.text);
  }

  async sendNewEventToAll(emails: string[], title: string, description: string, startDate: Date, slug: string, shortDescription?: string, location?: string, imageUrl?: string, tags?: string[], eventType?: string): Promise<boolean> {
    const template = EmailTemplates.newEvent(title, description, startDate, slug, shortDescription, location, imageUrl, tags, eventType, emailTemplateConfig.eventIntro, emailTemplateConfig.footerText);
    return this.sendBulk(emails, template.subject, template.html, template.text);
  }

  async sendPasswordReset(email: string, name: string, resetLink: string): Promise<boolean> {
    const template = EmailTemplates.passwordReset(name, resetLink);
    return this.send({ to: email, ...template });
  }

  async sendEventReminder(email: string, name: string, eventTitle: string, eventDate: Date, eventSlug: string): Promise<boolean> {
    const template = EmailTemplates.eventReminder(name, eventTitle, eventDate, eventSlug);
    return this.send({ to: email, ...template });
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

  isConfigured(): boolean {
    return this.configured;
  }
}

export const emailService = new EmailService();
