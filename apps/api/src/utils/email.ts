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
      <td align="center" style="padding: 48px 24px;">
        
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
              <div style="margin-top: 12px; font-size: 12px; color: #4b5563; text-transform: uppercase; letter-spacing: 3px; font-weight: 500;">
                SCRIET Coding Club
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
                  <td style="padding: 40px 36px;">
                    
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
                    <div style="margin: 24px 0; padding: 28px; background: linear-gradient(135deg, #1f293780, #0f172a80); border: 1px solid #1e293b; border-radius: 16px;">
                      ${content.body}
                    </div>
                    
                    ${content.cta ? `
                    <!-- CTA Button -->
                    <table cellpadding="0" cellspacing="0" style="margin-top: 32px;">
                      <tr>
                        <td>
                          <a href="${content.cta.url}" style="display: inline-block; padding: 16px 36px; background: linear-gradient(135deg, ${accent}, #f59e0b); color: #000000; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 14px ${accent}40;">
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
              
              <p style="margin: 0; font-size: 12px; color: #374151; line-height: 1.6;">
                SCRIET, CCS University, Meerut<br>
                <span style="color: #4b5563;">This is an automated message from code.scriet</span>
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
        <p style="margin: 0 0 20px; font-size: 16px; color: #e5e7eb; line-height: 1.7;">
          Welcome to <strong style="color: #fbbf24;">${clubName}</strong>! You've just joined a community of passionate developers who are building real projects, learning together, and pushing the boundaries of what's possible.
        </p>
        
        <div style="margin: 24px 0; padding: 20px 24px; background: linear-gradient(135deg, #fbbf2415, #f59e0b10); border-left: 3px solid #fbbf24; border-radius: 0 12px 12px 0;">
          <p style="margin: 0 0 12px; font-size: 13px; color: #fbbf24; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">What's waiting for you</p>
          <ul style="margin: 0; padding-left: 20px; color: #d1d5db; font-size: 15px; line-height: 1.8;">
            <li><strong style="color: #f9fafb;">Daily QOTD</strong> — Sharpen your problem-solving skills</li>
            <li><strong style="color: #f9fafb;">Live Events</strong> — Workshops, hackathons, and tech talks</li>
            <li><strong style="color: #f9fafb;">Leaderboard</strong> — Compete and track your progress</li>
            <li><strong style="color: #f9fafb;">Community</strong> — Connect with 100+ developers</li>
          </ul>
        </div>
        
        <p style="margin: 0; font-size: 15px; color: #9ca3af; line-height: 1.7;">
          Your first step? Complete your profile and explore upcoming events. We're excited to have you on board!
        </p>
      `;
    
    return {
      subject: `Welcome to ${clubName}, ${name}!`,
      html: generateEmailTemplate({
        preheader: `You're now part of the ${clubName} community. Let's build something amazing.`,
        accentColor: '#fbbf24',
        badge: { text: 'Welcome', icon: '👋' },
        title: `Hey ${name}, you're in!`,
        subtitle: `You've successfully joined ${clubName}. Time to start your journey.`,
        body: bodyContent,
        cta: { text: 'Explore Your Dashboard', url: `${SITE_URL}/dashboard` },
        footer: customFooter || 'Welcome to the team. Let\'s build the future together.',
      }),
      text: `Welcome to ${clubName}, ${name}! You're now part of our developer community. Visit ${SITE_URL}/dashboard to get started.`,
    };
  },

  // Event registration confirmation
  eventRegistration: (name: string, eventTitle: string, eventDate: Date, eventSlug: string, location?: string, imageUrl?: string): EmailTemplate => ({
    subject: `You're registered for ${eventTitle}`,
    html: generateEmailTemplate({
      preheader: `Your registration for ${eventTitle} is confirmed!`,
      accentColor: '#22c55e',
      badge: { text: 'Confirmed', icon: '✓' },
      title: `You're all set, ${name}!`,
      subtitle: `Your spot for "${eventTitle}" has been reserved.`,
      heroImage: imageUrl,
      infoCards: [
        { icon: '📅', label: 'Date', value: eventDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) },
        { icon: '⏰', label: 'Time', value: eventDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) },
        ...(location ? [{ icon: '📍', label: 'Venue', value: location }] : []),
      ],
      body: `
        <p style="margin: 0 0 16px; font-size: 15px; color: #d1d5db; line-height: 1.7;">
          We're excited to have you join us! Make sure to mark your calendar and arrive a few minutes early.
        </p>
        
        <div style="padding: 16px 20px; background: linear-gradient(135deg, #22c55e15, #16a34a10); border-left: 3px solid #22c55e; border-radius: 0 12px 12px 0;">
          <p style="margin: 0; font-size: 14px; color: #86efac;">
            <strong>Pro tip:</strong> Add this event to your calendar so you don't miss it!
          </p>
        </div>
      `,
      cta: { text: 'View Event Details', url: `${SITE_URL}/events/${eventSlug}` },
      footer: 'See you at the event!',
    }),
    text: `Hi ${name}, your registration for ${eventTitle} on ${eventDate.toLocaleDateString()} is confirmed!`,
  }),

  // New Announcement notification
  newAnnouncement: (title: string, body: string, priority: string, slug: string, shortDescription?: string, imageUrl?: string, tags?: string[], customIntro?: string, customFooter?: string): EmailTemplate => {
    const priorityConfig = {
      URGENT: { text: 'Urgent Update', icon: '🚨', color: '#ef4444' },
      HIGH: { text: 'Important', icon: '⚡', color: '#f59e0b' },
      MEDIUM: { text: 'Announcement', icon: '📢', color: '#3b82f6' },
      LOW: { text: 'Update', icon: '📌', color: '#6b7280' },
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
      subject: `New Event: ${title}`,
      html: generateEmailTemplate({
        preheader: `${title} — ${startDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}`,
        accentColor: '#22c55e',
        badge: { text: eventType || 'New Event', icon: '🎯' },
        title: title,
        subtitle: shortDescription || description.substring(0, 150),
        heroImage: imageUrl,
        infoCards: [
          { icon: '📅', label: 'Date', value: startDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) },
          { icon: '⏰', label: 'Time', value: startDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) },
          ...(location ? [{ icon: '📍', label: 'Venue', value: location }] : []),
        ],
        body: bodyContent,
        cta: { text: 'Register Now', url: `${SITE_URL}/events/${slug}` },
        secondaryCta: { text: 'View all events', url: `${SITE_URL}/events` },
        footer: customFooter || 'Limited spots available. Register early!',
      }),
      text: `New Event: ${title}\n\nDate: ${startDate.toLocaleDateString()}\nTime: ${startDate.toLocaleTimeString()}\n${location ? `Location: ${location}\n` : ''}\n${description}\n\nRegister: ${SITE_URL}/events/${slug}`,
    };
  },

  // Password reset
  passwordReset: (name: string, resetLink: string): EmailTemplate => ({
    subject: 'Reset your code.scriet password',
    html: generateEmailTemplate({
      preheader: 'Password reset requested for your account',
      accentColor: '#3b82f6',
      badge: { text: 'Security', icon: '🔐' },
      title: 'Password Reset Request',
      subtitle: `Hey ${name}, we received a request to reset your password.`,
      body: `
        <p style="margin: 0 0 20px; font-size: 15px; color: #d1d5db; line-height: 1.7;">
          Click the button below to create a new password. This link will expire in <strong style="color: #f9fafb;">1 hour</strong> for security reasons.
        </p>
        
        <div style="padding: 16px 20px; background: linear-gradient(135deg, #ef444415, #dc262610); border-left: 3px solid #ef4444; border-radius: 0 12px 12px 0;">
          <p style="margin: 0; font-size: 14px; color: #fca5a5;">
            <strong>Didn't request this?</strong> You can safely ignore this email. Your password will remain unchanged.
          </p>
        </div>
      `,
      cta: { text: 'Reset My Password', url: resetLink },
      footer: 'Keep your account secure.',
    }),
    text: `Hi ${name}, click this link to reset your password: ${resetLink}. This link expires in 1 hour.`,
  }),

  // Event reminder
  eventReminder: (name: string, eventTitle: string, eventDate: Date, eventSlug: string): EmailTemplate => ({
    subject: `Reminder: ${eventTitle} is tomorrow`,
    html: generateEmailTemplate({
      preheader: `Don't forget: ${eventTitle} is happening tomorrow!`,
      accentColor: '#eab308',
      badge: { text: 'Reminder', icon: '⏰' },
      title: `${eventTitle} is tomorrow!`,
      subtitle: `Hey ${name}, your registered event is coming up soon.`,
      infoCards: [
        { icon: '📅', label: 'Date', value: eventDate.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' }) },
        { icon: '⏰', label: 'Time', value: eventDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) },
      ],
      body: `
        <p style="margin: 0 0 16px; font-size: 15px; color: #d1d5db; line-height: 1.7;">
          Just a friendly reminder that the event you registered for is happening tomorrow. Make sure to:
        </p>
        
        <ul style="margin: 0 0 16px; padding-left: 20px; color: #d1d5db; font-size: 15px; line-height: 1.8;">
          <li>Review any prerequisites or materials</li>
          <li>Plan to arrive 5-10 minutes early</li>
          <li>Bring your laptop if needed</li>
        </ul>
        
        <div style="padding: 16px 20px; background: linear-gradient(135deg, #22c55e15, #16a34a10); border-left: 3px solid #22c55e; border-radius: 0 12px 12px 0;">
          <p style="margin: 0; font-size: 14px; color: #86efac;">
            We're looking forward to seeing you there!
          </p>
        </div>
      `,
      cta: { text: 'View Event Details', url: `${SITE_URL}/events/${eventSlug}` },
      footer: 'See you tomorrow!',
    }),
    text: `Hi ${name}, reminder: ${eventTitle} is tomorrow at ${eventDate.toLocaleTimeString()}!`,
  }),

  // Registration opens notification
  registrationOpens: (eventTitle: string, startDate: Date, slug: string, shortDescription?: string, imageUrl?: string): EmailTemplate => ({
    subject: `Registration Now Open: ${eventTitle}`,
    html: generateEmailTemplate({
      preheader: `Registration is now open for ${eventTitle}!`,
      accentColor: '#22c55e',
      badge: { text: 'Registration Open', icon: '🎫' },
      title: 'Registrations are Open!',
      subtitle: `Be among the first to secure your spot for "${eventTitle}"`,
      heroImage: imageUrl,
      infoCards: [
        { icon: '📅', label: 'Event Date', value: startDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) },
        { icon: '⏰', label: 'Time', value: startDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) },
      ],
      body: `
        ${shortDescription ? `<p style="margin: 0 0 16px; font-size: 15px; color: #d1d5db; line-height: 1.7;">${shortDescription}</p>` : ''}
        
        <div style="padding: 16px 20px; background: linear-gradient(135deg, #fbbf2415, #f59e0b10); border-left: 3px solid #fbbf24; border-radius: 0 12px 12px 0;">
          <p style="margin: 0; font-size: 14px; color: #fcd34d;">
            <strong>Spots are limited!</strong> Register early to secure your place.
          </p>
        </div>
      `,
      cta: { text: 'Register Now', url: `${SITE_URL}/events/${slug}` },
      footer: 'Don\'t miss this opportunity!',
    }),
    text: `Registration is now open for ${eventTitle}! Date: ${startDate.toLocaleDateString()}. Register: ${SITE_URL}/events/${slug}`,
  }),

  // Hiring application confirmation
  hiringApplication: (name: string, email: string, applyingRole: string): EmailTemplate => {
    const roleNames: Record<string, string> = {
      TECHNICAL: 'Technical Team',
      DESIGNING: 'Design Team',
      VIDEO_EDITING: 'Video Editing Team',
      MANAGEMENT: 'Management Team',
    };
    const roleName = roleNames[applyingRole] || applyingRole;
    
    return {
      subject: `Application Received — ${roleName}`,
      html: generateEmailTemplate({
        preheader: `We've received your application for the ${roleName}`,
        accentColor: '#8b5cf6',
        badge: { text: 'Application Received', icon: '📨' },
        title: `Thanks for applying, ${name}!`,
        subtitle: `Your application for the ${roleName} has been successfully submitted.`,
        body: `
          <p style="margin: 0 0 20px; font-size: 15px; color: #d1d5db; line-height: 1.7;">
            We're thrilled that you're interested in joining <strong style="color: #fbbf24;">code.scriet</strong>! Your application is now under review by our team.
          </p>
          
          <div style="margin: 24px 0; padding: 24px; background: linear-gradient(135deg, #8b5cf615, #7c3aed10); border: 1px solid #8b5cf630; border-radius: 16px;">
            <p style="margin: 0 0 12px; font-size: 13px; color: #a78bfa; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">What happens next</p>
            <ol style="margin: 0; padding-left: 20px; color: #d1d5db; font-size: 15px; line-height: 2;">
              <li>You'll be added to our <strong style="color: #f9fafb;">recruitment portal</strong></li>
              <li>Our team will review your application</li>
              <li>If shortlisted, you'll receive an <strong style="color: #f9fafb;">interview invitation</strong></li>
            </ol>
          </div>
          
          <div style="padding: 20px 24px; background: linear-gradient(135deg, #fbbf2415, #f59e0b10); border-left: 3px solid #fbbf24; border-radius: 0 12px 12px 0;">
            <p style="margin: 0 0 8px; font-size: 14px; color: #fbbf24; font-weight: 600;">Important:</p>
            <p style="margin: 0; font-size: 14px; color: #fcd34d; line-height: 1.6;">
              Please check your email <strong>at least once a day</strong> — including your <strong>Spam</strong>, <strong>Promotions</strong>, and other folders. All updates about your application will be sent to <strong>${email}</strong>.
            </p>
          </div>
          
          <p style="margin: 24px 0 0; font-size: 15px; color: #9ca3af; line-height: 1.7;">
            We appreciate your interest in joining our team. Good luck with your application!
          </p>
        `,
        cta: { text: 'Visit Our Website', url: SITE_URL },
        footer: 'Best of luck from the code.scriet team!',
      }),
      text: `Hi ${name}, thanks for applying to the ${roleName}! Your application has been received. You'll be added to our recruitment portal and will receive updates at ${email}. Please check your email (including spam/promotions) at least once a day.`,
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

  constructor() {
    this.apiKey = BREVO_API_KEY;
    this.fromEmail = EMAIL_FROM;
    this.fromName = EMAIL_FROM_NAME;
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

  isConfigured(): boolean {
    return this.configured;
  }
}

export const emailService = new EmailService();
