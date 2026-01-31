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
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || '';

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
  replyTo?: string | { email: string; name?: string };
  headers?: Record<string, string>;
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
  // Convert markdown to HTML
  const rawHtml = marked.parse(markdown, { async: false }) as string;
  
  // Style the HTML for emails with inline styles
  return rawHtml
    // Paragraphs
    .replace(/<p>/g, '<p style="margin: 0 0 16px 0; font-size: 15px; color: #e5e5e5; line-height: 1.7;">')
    // Headers
    .replace(/<h1>/g, '<h1 style="margin: 24px 0 12px 0; font-size: 24px; font-weight: 700; color: #fafafa;">')
    .replace(/<h2>/g, '<h2 style="margin: 20px 0 10px 0; font-size: 20px; font-weight: 600; color: #fafafa;">')
    .replace(/<h3>/g, '<h3 style="margin: 16px 0 8px 0; font-size: 18px; font-weight: 600; color: #fafafa;">')
    // Lists
    .replace(/<ul>/g, '<ul style="margin: 0 0 16px 0; padding-left: 20px; color: #e5e5e5;">')
    .replace(/<ol>/g, '<ol style="margin: 0 0 16px 0; padding-left: 20px; color: #e5e5e5;">')
    .replace(/<li>/g, '<li style="margin: 6px 0; line-height: 1.6;">')
    // Links
    .replace(/<a /g, '<a style="color: #f59e0b; text-decoration: underline;" ')
    // Strong/Bold
    .replace(/<strong>/g, '<strong style="color: #fafafa; font-weight: 600;">')
    // Emphasis/Italic
    .replace(/<em>/g, '<em style="color: #d4d4d4;">')
    // Code blocks
    .replace(/<pre>/g, '<pre style="margin: 16px 0; padding: 16px; background-color: #1a1a1a; border-radius: 8px; overflow-x: auto; border: 1px solid #333;">')
    .replace(/<code>/g, '<code style="font-family: \'SF Mono\', \'Fira Code\', \'Courier New\', monospace; font-size: 13px; color: #22c55e;">')
    // Inline code (not in pre)
    .replace(/(<code style="[^"]*">)(?![^<]*<\/pre>)/g, '<code style="font-family: \'SF Mono\', monospace; font-size: 13px; padding: 2px 6px; background-color: #262626; border-radius: 4px; color: #f59e0b;">')
    // Blockquotes
    .replace(/<blockquote>/g, '<blockquote style="margin: 16px 0; padding: 12px 20px; border-left: 4px solid #f59e0b; background-color: #1f1f1f; color: #a3a3a3; font-style: italic;">')
    // Horizontal rules
    .replace(/<hr>/g, '<hr style="margin: 24px 0; border: none; height: 1px; background: linear-gradient(to right, transparent, #404040, transparent);">')
    // Tables
    .replace(/<table>/g, '<table style="width: 100%; margin: 16px 0; border-collapse: collapse;">')
    .replace(/<th>/g, '<th style="padding: 10px 12px; background-color: #1f1f1f; border: 1px solid #333; color: #fafafa; font-weight: 600; text-align: left;">')
    .replace(/<td>/g, '<td style="padding: 10px 12px; border: 1px solid #333; color: #d4d4d4;">');
}

// Strip HTML tags for plain text version
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
// Clean, High-Contrast Email Template
// Optimized for Primary inbox delivery
// ============================================

const generateEmailTemplate = (content: {
  preheader?: string;
  badge?: { text: string; emoji?: string; color: string };
  title: string;
  subtitle?: string;
  heroImage?: string;
  body: string;
  cta?: { text: string; url: string };
  secondaryCta?: { text: string; url: string };
  infoCards?: Array<{ icon: string; label: string; value: string }>;
  tags?: string[];
  footer?: string;
}) => {
  const infoCardsHtml = content.infoCards?.map(card => `
    <tr>
      <td style="padding: 12px 16px; border-bottom: 1px solid #2a2a2a;">
        <table cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
          <tr>
            <td style="width: 40px; vertical-align: middle;">
              <div style="width: 36px; height: 36px; background-color: #1f1f1f; border-radius: 8px; text-align: center; line-height: 36px; font-size: 18px;">${card.icon}</div>
            </td>
            <td style="vertical-align: middle; padding-left: 12px;">
              <span style="display: block; font-size: 11px; color: #888888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">${card.label}</span>
              <span style="font-size: 15px; color: #ffffff; font-weight: 600;">${card.value}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('') || '';

  const tagsHtml = content.tags?.map(tag => `
    <span style="display: inline-block; margin: 3px 4px 3px 0; padding: 4px 10px; background-color: #262626; color: #f59e0b; font-size: 11px; border-radius: 4px; font-weight: 500;">#${tag}</span>
  `).join('') || '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>code.scriet</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
  ${content.preheader ? `<div style="display: none; max-height: 0; overflow: hidden;">${content.preheader}</div>` : ''}
  
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        
        <!-- Main Container -->
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #121212; border-radius: 12px; overflow: hidden;">
          
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #1f1f1f;">
              <div style="font-family: 'Courier New', monospace; font-size: 22px; font-weight: bold; color: #f59e0b; margin-bottom: 4px;">
                &lt;code.scriet/&gt;
              </div>
              <div style="font-size: 11px; color: #666666; text-transform: uppercase; letter-spacing: 2px;">
                SCRIET Coding Club
              </div>
            </td>
          </tr>
          
          ${content.heroImage ? `
          <!-- Hero Image -->
          <tr>
            <td style="padding: 0;">
              <img src="${content.heroImage}" alt="" style="width: 100%; height: auto; display: block;" />
            </td>
          </tr>
          ` : ''}
          
          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              
              ${content.badge ? `
              <!-- Badge -->
              <div style="margin-bottom: 20px;">
                <span style="display: inline-block; padding: 6px 14px; background-color: ${content.badge.color}; color: #000000; font-size: 12px; font-weight: 700; border-radius: 4px; text-transform: uppercase; letter-spacing: 1px;">
                  ${content.badge.emoji ? content.badge.emoji + ' ' : ''}${content.badge.text}
                </span>
              </div>
              ` : ''}
              
              <!-- Title -->
              <h1 style="margin: 0 0 12px; font-size: 26px; font-weight: 700; color: #ffffff; line-height: 1.3;">
                ${content.title}
              </h1>
              
              ${content.subtitle ? `
              <p style="margin: 0 0 24px; font-size: 16px; color: #a0a0a0; line-height: 1.5;">
                ${content.subtitle}
              </p>
              ` : ''}
              
              ${content.infoCards && content.infoCards.length > 0 ? `
              <!-- Info Cards -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #1a1a1a; border-radius: 8px; overflow: hidden;">
                ${infoCardsHtml}
              </table>
              ` : ''}
              
              <!-- Body -->
              <div style="color: #d0d0d0; font-size: 15px; line-height: 1.7;">
                ${content.body}
              </div>
              
              ${content.tags && content.tags.length > 0 ? `
              <div style="margin-top: 20px;">
                ${tagsHtml}
              </div>
              ` : ''}
              
              ${content.cta ? `
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 28px;">
                <tr>
                  <td>
                    <a href="${content.cta.url}" style="display: inline-block; padding: 14px 32px; background-color: #f59e0b; color: #000000; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 6px;">
                      ${content.cta.text}
                    </a>
                  </td>
                </tr>
              </table>
              ` : ''}
              
              ${content.secondaryCta ? `
              <p style="margin: 16px 0 0;">
                <a href="${content.secondaryCta.url}" style="color: #f59e0b; font-size: 14px; text-decoration: underline;">
                  ${content.secondaryCta.text}
                </a>
              </p>
              ` : ''}
              
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #0f0f0f; border-top: 1px solid #1f1f1f;">
              ${content.footer ? `
              <p style="margin: 0 0 16px; font-size: 13px; color: #888888; text-align: center;">
                ${content.footer}
              </p>
              ` : ''}
              
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${SITE_URL}" style="color: #666666; font-size: 12px; text-decoration: none; margin: 0 8px;">Website</a>
                    <span style="color: #333333;">|</span>
                    <a href="${SITE_URL}/events" style="color: #666666; font-size: 12px; text-decoration: none; margin: 0 8px;">Events</a>
                    <span style="color: #333333;">|</span>
                    <a href="${SITE_URL}/dashboard" style="color: #666666; font-size: 12px; text-decoration: none; margin: 0 8px;">Dashboard</a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 16px 0 0; font-size: 11px; color: #555555; text-align: center;">
                SCRIET, CCS University, Meerut<br>
                This is a transactional email from code.scriet.
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
  // Welcome email for new members - PREMIUM DESIGN
  welcome: (name: string, clubName: string, customBody?: string, customFooter?: string): EmailTemplate => {
    // If custom body provided, use it; otherwise use default premium template
    const bodyContent = customBody 
      ? markdownToEmailHtml(customBody.replace(/\{\{name\}\}/g, name).replace(/\{\{clubName\}\}/g, clubName))
      : `
        <p style="margin: 0 0 24px; font-size: 15px; color: #e0e0e0; line-height: 1.7;">
          You're now part of a community of developers who are building real projects, solving real problems, and growing together.
        </p>
        
        <p style="margin: 0 0 16px; font-size: 13px; color: #f59e0b; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">What you get:</p>
        
        <table style="width: 100%; margin-bottom: 24px;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #2a2a2a;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width: 32px; font-size: 18px;">💡</td>
                  <td>
                    <strong style="color: #ffffff;">Daily QOTD</strong>
                    <span style="color: #a0a0a0;"> — Master algorithms & data structures</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #2a2a2a;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width: 32px; font-size: 18px;">🎯</td>
                  <td>
                    <strong style="color: #ffffff;">Live Events</strong>
                    <span style="color: #a0a0a0;"> — Workshops & hackathons</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #2a2a2a;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width: 32px; font-size: 18px;">📊</td>
                  <td>
                    <strong style="color: #ffffff;">Leaderboard</strong>
                    <span style="color: #a0a0a0;"> — Track your progress</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 0;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width: 32px; font-size: 18px;">👥</td>
                  <td>
                    <strong style="color: #ffffff;">Community</strong>
                    <span style="color: #a0a0a0;"> — Connect with 100+ builders</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        
        <p style="margin: 0 0 16px; font-size: 13px; color: #f59e0b; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Get started:</p>
        
        <ol style="margin: 0 0 24px; padding-left: 20px; color: #d0d0d0; font-size: 15px; line-height: 2;">
          <li><strong style="color: #ffffff;">Complete your profile</strong> — Add your bio and skills</li>
          <li><strong style="color: #ffffff;">Solve today's QOTD</strong> — Start climbing the leaderboard</li>
          <li><strong style="color: #ffffff;">Register for an event</strong> — Meet the community</li>
        </ol>
      `;
    
    return {
      subject: `${name}, welcome to ${clubName}`,
      html: generateEmailTemplate({
        preheader: `You're in. Let's build something amazing together.`,
        badge: { text: 'You\'re In!', emoji: '🚀', color: '#f59e0b' },
        title: `Welcome, ${name}!`,
        subtitle: `You just joined 100+ developers building the future.`,
        body: bodyContent,
        cta: { text: 'Go to Dashboard', url: `${SITE_URL}/dashboard` },
        footer: customFooter || 'Welcome to the team.',
      }),
      text: `Welcome to ${clubName}, ${name}! You're now part of a community of 100+ developers building amazing projects. Visit ${SITE_URL}/dashboard to get started.`,
    };
  },

  // Event registration confirmation
  eventRegistration: (name: string, eventTitle: string, eventDate: Date, eventSlug: string, location?: string, imageUrl?: string): EmailTemplate => ({
    subject: `Registered: ${eventTitle}`,
    html: generateEmailTemplate({
      preheader: `Your spot for ${eventTitle} is confirmed!`,
      badge: { text: 'Registered', emoji: '✓', color: '#22c55e' },
      title: `You're in!`,
      subtitle: `Your registration for "${eventTitle}" has been confirmed.`,
      heroImage: imageUrl,
      infoCards: [
        { icon: '📅', label: 'Date', value: eventDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) },
        { icon: '⏰', label: 'Time', value: eventDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) },
        ...(location ? [{ icon: '📍', label: 'Location', value: location }] : []),
      ],
      body: `
        <p style="margin: 0 0 16px; font-size: 15px; color: #e5e5e5; line-height: 1.6;">
          Hey <strong style="color: #f59e0b;">${name}</strong>, great choice! We can't wait to see you there.
        </p>
        
        <div style="padding: 14px 18px; background-color: #1a2e1a; border-radius: 8px;">
          <p style="margin: 0; font-size: 13px; color: #86efac;">
            Add this to your calendar and arrive 5-10 minutes early!
          </p>
        </div>
      `,
      cta: { text: 'View Event', url: `${SITE_URL}/events/${eventSlug}` },
      footer: 'See you there!',
    }),
    text: `Hi ${name}, you're registered for ${eventTitle} on ${eventDate.toLocaleDateString()}. See you there!`,
  }),

  // New Announcement notification
  newAnnouncement: (title: string, body: string, priority: string, slug: string, shortDescription?: string, imageUrl?: string, tags?: string[], customIntro?: string, customFooter?: string): EmailTemplate => {
    const priorityConfig = {
      URGENT: { text: 'Urgent', emoji: '🚨', color: '#ef4444' },
      HIGH: { text: 'Important', emoji: '⚡', color: '#f59e0b' },
      MEDIUM: { text: 'Announcement', emoji: '📢', color: '#3b82f6' },
      LOW: { text: 'Update', emoji: '📌', color: '#6b7280' },
    };
    const config = priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.MEDIUM;
    
    // Convert markdown body to email HTML
    const htmlBody = markdownToEmailHtml(body.length > 800 ? body.substring(0, 800) + '...' : body);
    
    // Add custom intro if provided
    const finalBody = customIntro 
      ? `<div style="margin-bottom: 20px;">${markdownToEmailHtml(customIntro)}</div>${htmlBody}`
      : htmlBody;
    
    return {
      subject: `${priority === 'URGENT' ? '🚨 ' : ''}${title}`,
      html: generateEmailTemplate({
        preheader: shortDescription || `New announcement from code.scriet: ${title}`,
        badge: config,
        title: title,
        subtitle: shortDescription,
        heroImage: imageUrl,
        body: finalBody,
        tags: tags,
        cta: { text: 'Read More', url: `${SITE_URL}/announcements/${slug}` },
        footer: customFooter || 'Stay informed, stay ahead.',
      }),
      text: `[${priority}] ${title}\n\n${shortDescription || ''}\n\n${body}\n\nRead more: ${SITE_URL}/announcements/${slug}`,
    };
  },

  // New Event notification
  newEvent: (title: string, description: string, startDate: Date, slug: string, shortDescription?: string, location?: string, imageUrl?: string, tags?: string[], eventType?: string, customIntro?: string, customFooter?: string): EmailTemplate => {
    // Convert description markdown to HTML
    const descriptionHtml = markdownToEmailHtml(description.length > 600 ? description.substring(0, 600) + '...' : description);
    
    // Add custom intro if provided
    const bodyContent = customIntro
      ? `<div style="margin-bottom: 16px;">${markdownToEmailHtml(customIntro)}</div>${descriptionHtml}`
      : descriptionHtml;
    
    return {
      subject: `New Event: ${title}`,
      html: generateEmailTemplate({
        preheader: `${title} — ${startDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} ${location ? `at ${location}` : ''}`,
        badge: { text: eventType || 'New Event', emoji: '🎯', color: '#22c55e' },
        title: title,
        subtitle: shortDescription || description.substring(0, 150),
        heroImage: imageUrl,
        infoCards: [
          { icon: '📅', label: 'Date', value: startDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) },
          { icon: '⏰', label: 'Time', value: startDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) },
          ...(location ? [{ icon: '📍', label: 'Location', value: location }] : []),
        ],
        body: bodyContent,
        tags: tags,
        cta: { text: 'Register Now', url: `${SITE_URL}/events/${slug}` },
        secondaryCta: { text: 'View all events', url: `${SITE_URL}/events` },
        footer: customFooter || "Limited spots available.",
      }),
      text: `New Event: ${title}\n\nDate: ${startDate.toLocaleDateString()}\nTime: ${startDate.toLocaleTimeString()}\n${location ? `Location: ${location}\n` : ''}\n${description}\n\nRegister now: ${SITE_URL}/events/${slug}`,
    };
  },

  // Password reset
  passwordReset: (name: string, resetLink: string): EmailTemplate => ({
    subject: 'Reset your password',
    html: generateEmailTemplate({
      preheader: 'Password reset requested for your code.scriet account',
      badge: { text: 'Security', emoji: '🔐', color: '#3b82f6' },
      title: 'Password Reset',
      subtitle: `Hey ${name}, we received a request to reset your password.`,
      body: `
        <p style="margin: 0 0 20px; font-size: 15px; color: #e5e5e5; line-height: 1.6;">
          Click the button below to create a new password. This link expires in <strong style="color: #ffffff;">1 hour</strong>.
        </p>
        
        <div style="padding: 14px 18px; background-color: #2a1a1a; border-radius: 8px;">
          <p style="margin: 0; font-size: 13px; color: #fca5a5;">
            <strong>Didn't request this?</strong> Ignore this email — your password won't change.
          </p>
        </div>
      `,
      cta: { text: 'Reset Password', url: resetLink },
      footer: 'Keep your account secure.',
    }),
    text: `Hi ${name}, click this link to reset your password: ${resetLink}. This link expires in 1 hour.`,
  }),

  // Event reminder
  eventReminder: (name: string, eventTitle: string, eventDate: Date, eventSlug: string): EmailTemplate => ({
    subject: `Reminder: ${eventTitle} is tomorrow`,
    html: generateEmailTemplate({
      preheader: `Reminder: ${eventTitle} is happening tomorrow!`,
      badge: { text: 'Reminder', emoji: '⏰', color: '#eab308' },
      title: `${eventTitle} is tomorrow!`,
      subtitle: `Don't forget about your registered event.`,
      infoCards: [
        { icon: '📅', label: 'Date', value: eventDate.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' }) },
        { icon: '⏰', label: 'Time', value: eventDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) },
      ],
      body: `
        <p style="margin: 0 0 16px; font-size: 15px; color: #e5e5e5; line-height: 1.6;">
          Hey <strong style="color: #f59e0b;">${name}</strong>, just a friendly reminder about your upcoming event!
        </p>
        
        <div style="padding: 14px 18px; background-color: #1a2e1a; border-radius: 8px;">
          <p style="margin: 0; font-size: 13px; color: #86efac;">
            Review any prerequisites and arrive a few minutes early.
          </p>
        </div>
      `,
      cta: { text: 'View Event', url: `${SITE_URL}/events/${eventSlug}` },
      footer: 'See you tomorrow!',
    }),
    text: `Hi ${name}, reminder: ${eventTitle} is tomorrow at ${eventDate.toLocaleTimeString()}!`,
  }),

  // Registration opens notification
  registrationOpens: (eventTitle: string, startDate: Date, slug: string, shortDescription?: string, imageUrl?: string): EmailTemplate => ({
    subject: `Registration Open: ${eventTitle}`,
    html: generateEmailTemplate({
      preheader: `Registration is now open for ${eventTitle}!`,
      badge: { text: 'Registration Open', emoji: '🎫', color: '#22c55e' },
      title: 'Registration Open!',
      subtitle: `Secure your spot for "${eventTitle}"`,
      heroImage: imageUrl,
      infoCards: [
        { icon: '📅', label: 'Event Date', value: startDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) },
        { icon: '⏰', label: 'Time', value: startDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) },
      ],
      body: `
        ${shortDescription ? `<p style="margin: 0 0 16px; font-size: 15px; color: #e5e5e5; line-height: 1.6;">${shortDescription}</p>` : ''}
        
        <div style="padding: 14px 18px; background-color: #2a2010; border-radius: 8px;">
          <p style="margin: 0; font-size: 13px; color: #fcd34d;">
            Spots are limited and fill up fast.
          </p>
        </div>
      `,
      cta: { text: 'Register Now', url: `${SITE_URL}/events/${slug}` },
      footer: "Don't miss out!",
    }),
    text: `Registration is now open for ${eventTitle}!\n\nDate: ${startDate.toLocaleDateString()}\n\nRegister now: ${SITE_URL}/events/${slug}`,
  }),
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

  // Send email via Brevo API
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
        sender: {
          name: this.fromName,
          email: this.fromEmail,
        },
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
        logger.error('❌ Brevo API error response:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
          sender: this.fromEmail,
          recipients: recipients.map(r => r.email),
        });
        throw new Error(`Brevo API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      logger.info('📧 Email sent successfully via Brevo', {
        messageId: result.messageId,
        recipients: recipients.length,
        recipientEmails: recipients.map(r => r.email),
        subject: options.subject,
        sender: this.fromEmail,
      });
      return true;
    } catch (error) {
      logger.error('❌ Failed to send email via Brevo', {
        to: Array.isArray(options.to) ? options.to.length + ' recipients' : options.to,
        subject: options.subject,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  // Send to multiple recipients in batches
  async sendBulk(emails: string[], subject: string, html: string, text?: string): Promise<boolean> {
    if (!this.configured || emails.length === 0) {
      return false;
    }

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
    const template = EmailTemplates.welcome(
      name,
      clubName,
      emailTemplateConfig.welcomeBody || undefined,
      emailTemplateConfig.footerText || undefined
    );
    return this.send({ to: email, ...template });
  }

  async sendEventRegistration(email: string, name: string, eventTitle: string, eventDate: Date, eventSlug: string, location?: string, imageUrl?: string): Promise<boolean> {
    const template = EmailTemplates.eventRegistration(name, eventTitle, eventDate, eventSlug, location, imageUrl);
    return this.send({ to: email, ...template });
  }

  async sendAnnouncementToAll(emails: string[], title: string, body: string, priority: string, slug: string, shortDescription?: string, imageUrl?: string, tags?: string[]): Promise<boolean> {
    const template = EmailTemplates.newAnnouncement(
      title,
      body,
      priority,
      slug,
      shortDescription,
      imageUrl,
      tags,
      emailTemplateConfig.announcementIntro || undefined,
      emailTemplateConfig.footerText || undefined
    );
    return this.sendBulk(emails, template.subject, template.html, template.text);
  }

  async sendNewEventToAll(emails: string[], title: string, description: string, startDate: Date, slug: string, shortDescription?: string, location?: string, imageUrl?: string, tags?: string[], eventType?: string): Promise<boolean> {
    const template = EmailTemplates.newEvent(
      title,
      description,
      startDate,
      slug,
      shortDescription,
      location,
      imageUrl,
      tags,
      eventType,
      emailTemplateConfig.eventIntro || undefined,
      emailTemplateConfig.footerText || undefined
    );
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

  isConfigured(): boolean {
    return this.configured;
  }
}

export const emailService = new EmailService();
