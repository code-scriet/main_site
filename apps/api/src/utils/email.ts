// Email service for notifications using Brevo (formerly Sendinblue)
// Professional email notifications for code.scriet - The Coding Club

import { logger } from './logger.js';

// Brevo API configuration
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'code.scriet@codescriet.dev';
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'code.scriet';

// Always use production URL for email links
const SITE_URL = 'https://codescriet.dev';

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
// Professional Email Template Generator
// Modern tech-club aesthetic with code elements
// ============================================

const generateEmailTemplate = (content: {
  preheader?: string;
  badge?: { text: string; color: string; bgColor: string };
  title: string;
  subtitle?: string;
  body: string;
  cta?: { text: string; url: string };
  secondaryCta?: { text: string; url: string };
  footer?: string;
}) => {
  return `
<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings xmlns:o="urn:schemas-microsoft-com:office:office">
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style>
    td,th,div,p,a,h1,h2,h3,h4,h5,h6 {font-family: "Segoe UI", sans-serif; mso-line-height-rule: exactly;}
  </style>
  <![endif]-->
  <title>code.scriet</title>
  <style>
    .hover-bg-amber-600:hover { background-color: #d97706 !important; }
    @media (max-width: 600px) {
      .sm-px-4 { padding-left: 16px !important; padding-right: 16px !important; }
      .sm-py-8 { padding-top: 32px !important; padding-bottom: 32px !important; }
    }
  </style>
</head>
<body style="margin: 0; width: 100%; padding: 0; word-break: break-word; -webkit-font-smoothing: antialiased; background-color: #0a0a0a;">
  ${content.preheader ? `<div style="display: none; max-height: 0; overflow: hidden;">${content.preheader}</div>` : ''}
  
  <div role="article" aria-roledescription="email" aria-label="Email from code.scriet" lang="en" style="font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    
    <!-- Outer Container -->
    <table style="width: 100%; background-color: #0a0a0a;" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td align="center" style="padding: 40px 16px;">
          
          <!-- Email Card -->
          <table style="width: 100%; max-width: 580px; border-radius: 16px; overflow: hidden; background-color: #171717; border: 1px solid #262626;" cellpadding="0" cellspacing="0" role="presentation">
            
            <!-- Header with Gradient -->
            <tr>
              <td style="background: linear-gradient(135deg, #f59e0b 0%, #ea580c 50%, #dc2626 100%); padding: 0;">
                <table style="width: 100%;" cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td style="padding: 32px 40px; text-align: center;">
                      <!-- Logo -->
                      <table style="width: 100%;" cellpadding="0" cellspacing="0" role="presentation">
                        <tr>
                          <td align="center">
                            <div style="display: inline-block; background-color: rgba(0,0,0,0.2); border-radius: 12px; padding: 12px 24px;">
                              <span style="font-family: 'SF Mono', 'Fira Code', 'Courier New', monospace; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">
                                &lt;code<span style="color: rgba(255,255,255,0.8); font-weight: 400;">.scriet</span>/&gt;
                              </span>
                            </div>
                          </td>
                        </tr>
                        <tr>
                          <td align="center" style="padding-top: 12px;">
                            <span style="font-size: 12px; color: rgba(255,255,255,0.8); text-transform: uppercase; letter-spacing: 2px;">The Coding Club • SCRIET</span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            
            <!-- Terminal-style decoration -->
            <tr>
              <td style="background-color: #1f1f1f; padding: 12px 24px; border-bottom: 1px solid #333333;">
                <table style="width: 100%;" cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td>
                      <span style="display: inline-block; width: 12px; height: 12px; background-color: #ef4444; border-radius: 50%; margin-right: 8px;"></span>
                      <span style="display: inline-block; width: 12px; height: 12px; background-color: #eab308; border-radius: 50%; margin-right: 8px;"></span>
                      <span style="display: inline-block; width: 12px; height: 12px; background-color: #22c55e; border-radius: 50%;"></span>
                    </td>
                    <td style="text-align: right;">
                      <span style="font-family: 'SF Mono', 'Courier New', monospace; font-size: 11px; color: #737373;">~/code.scriet/notifications</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            
            <!-- Main Content -->
            <tr>
              <td style="padding: 40px 40px 32px;">
                
                ${content.badge ? `
                <!-- Badge -->
                <table style="width: 100%;" cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td style="padding-bottom: 20px;">
                      <span style="display: inline-block; padding: 6px 14px; background-color: ${content.badge.bgColor}; color: ${content.badge.color}; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; border-radius: 100px; border: 1px solid ${content.badge.color}33;">
                        ${content.badge.text}
                      </span>
                    </td>
                  </tr>
                </table>
                ` : ''}
                
                <!-- Title -->
                <h1 style="margin: 0 0 12px; font-size: 28px; font-weight: 700; color: #fafafa; line-height: 1.3; letter-spacing: -0.5px;">
                  ${content.title}
                </h1>
                
                ${content.subtitle ? `
                <p style="margin: 0 0 24px; font-size: 16px; color: #a3a3a3; line-height: 1.5;">
                  ${content.subtitle}
                </p>
                ` : ''}
                
                <!-- Body Content -->
                <div style="margin: 24px 0; padding: 24px; background-color: #262626; border-radius: 12px; border-left: 4px solid #f59e0b;">
                  ${content.body}
                </div>
                
                ${content.cta ? `
                <!-- CTA Button -->
                <table style="width: 100%;" cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td align="center" style="padding: 24px 0 8px;">
                      <a href="${content.cta.url}" class="hover-bg-amber-600" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 10px; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.35);">
                        ${content.cta.text}
                      </a>
                    </td>
                  </tr>
                </table>
                ` : ''}
                
                ${content.secondaryCta ? `
                <table style="width: 100%;" cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td align="center" style="padding: 8px 0;">
                      <a href="${content.secondaryCta.url}" style="font-size: 13px; color: #f59e0b; text-decoration: none;">
                        ${content.secondaryCta.text} →
                      </a>
                    </td>
                  </tr>
                </table>
                ` : ''}
                
              </td>
            </tr>
            
            <!-- Code-style Divider -->
            <tr>
              <td style="padding: 0 40px;">
                <div style="height: 1px; background: linear-gradient(to right, transparent, #404040, transparent);"></div>
              </td>
            </tr>
            
            <!-- Footer -->
            <tr>
              <td style="padding: 32px 40px; text-align: center;">
                <!-- Social/Links -->
                <table style="width: 100%;" cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td align="center" style="padding-bottom: 20px;">
                      <a href="${SITE_URL}" style="display: inline-block; margin: 0 8px; padding: 10px 16px; background-color: #262626; color: #a3a3a3; font-size: 12px; text-decoration: none; border-radius: 6px; border: 1px solid #333;">Website</a>
                      <a href="${SITE_URL}/events" style="display: inline-block; margin: 0 8px; padding: 10px 16px; background-color: #262626; color: #a3a3a3; font-size: 12px; text-decoration: none; border-radius: 6px; border: 1px solid #333;">Events</a>
                      <a href="${SITE_URL}/announcements" style="display: inline-block; margin: 0 8px; padding: 10px 16px; background-color: #262626; color: #a3a3a3; font-size: 12px; text-decoration: none; border-radius: 6px; border: 1px solid #333;">Updates</a>
                    </td>
                  </tr>
                </table>
                
                <!-- Branding -->
                <p style="margin: 0 0 8px; font-family: 'SF Mono', 'Courier New', monospace; font-size: 14px; color: #f59e0b; font-weight: 600;">
                  &lt;code.scriet/&gt;
                </p>
                <p style="margin: 0 0 16px; font-size: 12px; color: #737373;">
                  ${content.footer || 'Building the next generation of developers.'}
                </p>
                <p style="margin: 0; font-size: 11px; color: #525252;">
                  SCRIET, CCS University, Meerut
                </p>
              </td>
            </tr>
            
          </table>
          
          <!-- Legal Footer -->
          <table style="width: 100%; max-width: 580px;" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="padding: 24px 16px; text-align: center;">
                <p style="margin: 0; font-size: 11px; color: #525252; line-height: 1.6;">
                  You're receiving this because you're a member of code.scriet.<br>
                  <a href="${SITE_URL}/dashboard" style="color: #737373; text-decoration: underline;">Manage preferences</a>
                </p>
              </td>
            </tr>
          </table>
          
        </td>
      </tr>
    </table>
    
  </div>
</body>
</html>
`;
};

// ============================================
// Email Templates
// ============================================

export const EmailTemplates = {
  // Welcome email for new members
  welcome: (name: string, clubName: string): EmailTemplate => ({
    subject: `Welcome to ${clubName}! Let's start coding 🚀`,
    html: generateEmailTemplate({
      preheader: `Hey ${name}! Your journey with code.scriet begins now.`,
      badge: { text: '🎉 Welcome Aboard', color: '#a78bfa', bgColor: '#a78bfa15' },
      title: `Hey ${name}!`,
      subtitle: `Welcome to the code.scriet family — you're now part of an elite community of builders and innovators.`,
      body: `
        <p style="margin: 0 0 16px; font-size: 15px; color: #d4d4d4; line-height: 1.7;">
          We're stoked to have you here! At <strong style="color: #f59e0b;">code.scriet</strong>, we believe in learning by doing, collaborating on real projects, and pushing each other to become better developers.
        </p>
        
        <table style="width: 100%; margin: 20px 0;" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #404040;">
              <span style="color: #22c55e; font-family: 'Courier New', monospace; margin-right: 12px;">▸</span>
              <span style="color: #fafafa; font-size: 14px;"><strong>Daily QOTD</strong></span>
              <span style="color: #a3a3a3; font-size: 13px;"> — Sharpen your skills with our Question of the Day</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #404040;">
              <span style="color: #22c55e; font-family: 'Courier New', monospace; margin-right: 12px;">▸</span>
              <span style="color: #fafafa; font-size: 14px;"><strong>Events & Workshops</strong></span>
              <span style="color: #a3a3a3; font-size: 13px;"> — Hands-on learning with industry experts</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #404040;">
              <span style="color: #22c55e; font-family: 'Courier New', monospace; margin-right: 12px;">▸</span>
              <span style="color: #fafafa; font-size: 14px;"><strong>Leaderboard</strong></span>
              <span style="color: #a3a3a3; font-size: 13px;"> — Compete and climb the ranks</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 0;">
              <span style="color: #22c55e; font-family: 'Courier New', monospace; margin-right: 12px;">▸</span>
              <span style="color: #fafafa; font-size: 14px;"><strong>Community</strong></span>
              <span style="color: #a3a3a3; font-size: 13px;"> — Connect with fellow developers</span>
            </td>
          </tr>
        </table>
        
        <p style="margin: 16px 0 0; font-size: 14px; color: #a3a3a3; font-style: italic;">
          "The best time to start coding was yesterday. The next best time is now."
        </p>
      `,
      cta: { text: 'Launch Your Dashboard →', url: `${SITE_URL}/dashboard` },
      footer: 'Happy coding! The code.scriet Team 🚀',
    }),
    text: `Welcome to ${clubName}, ${name}! We're thrilled to have you join us. Visit ${SITE_URL} to get started.`,
  }),

  // Event registration confirmation
  eventRegistration: (name: string, eventTitle: string, eventDate: Date, eventSlug: string, location?: string, imageUrl?: string): EmailTemplate => ({
    subject: `You're in! ${eventTitle} 🎫`,
    html: generateEmailTemplate({
      preheader: `Your spot for ${eventTitle} is confirmed!`,
      badge: { text: '✓ Registered', color: '#22c55e', bgColor: '#22c55e15' },
      title: `You're registered!`,
      subtitle: `Your spot for "${eventTitle}" has been confirmed.`,
      body: `
        <p style="margin: 0 0 20px; font-size: 15px; color: #d4d4d4; line-height: 1.6;">
          Hey <strong style="color: #f59e0b;">${name}</strong>, great choice! Here's what you need to know:
        </p>
        
        <table style="width: 100%; background-color: #1f1f1f; border-radius: 8px; overflow: hidden;" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="padding: 16px 20px; border-bottom: 1px solid #333;">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="width: 40px; vertical-align: top;">
                    <span style="font-size: 20px;">📅</span>
                  </td>
                  <td>
                    <span style="font-size: 11px; color: #737373; text-transform: uppercase; letter-spacing: 1px;">Date</span><br>
                    <span style="font-size: 15px; color: #fafafa; font-weight: 500;">${eventDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 20px; border-bottom: 1px solid #333;">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="width: 40px; vertical-align: top;">
                    <span style="font-size: 20px;">⏰</span>
                  </td>
                  <td>
                    <span style="font-size: 11px; color: #737373; text-transform: uppercase; letter-spacing: 1px;">Time</span><br>
                    <span style="font-size: 15px; color: #fafafa; font-weight: 500;">${eventDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${location ? `
          <tr>
            <td style="padding: 16px 20px;">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="width: 40px; vertical-align: top;">
                    <span style="font-size: 20px;">📍</span>
                  </td>
                  <td>
                    <span style="font-size: 11px; color: #737373; text-transform: uppercase; letter-spacing: 1px;">Location</span><br>
                    <span style="font-size: 15px; color: #fafafa; font-weight: 500;">${location}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ` : ''}
        </table>
        
        <p style="margin: 20px 0 0; padding: 14px 18px; background-color: #422006; border-radius: 8px; font-size: 13px; color: #fcd34d;">
          💡 <strong>Pro tip:</strong> Add this to your calendar and arrive 5 minutes early!
        </p>
      `,
      cta: { text: 'View Event Details', url: `${SITE_URL}/events/${eventSlug}` },
      footer: 'See you there! 🎉',
    }),
    text: `Hi ${name}, you're registered for ${eventTitle} on ${eventDate.toLocaleDateString()}. See you there!`,
  }),

  // New Announcement notification
  newAnnouncement: (title: string, body: string, priority: string, slug: string, shortDescription?: string, imageUrl?: string, tags?: string[]): EmailTemplate => {
    const priorityConfig = {
      URGENT: { badge: '🚨 Urgent Update', color: '#ef4444', bgColor: '#ef444415' },
      HIGH: { badge: '⚡ Important', color: '#f59e0b', bgColor: '#f59e0b15' },
      MEDIUM: { badge: '📢 Announcement', color: '#3b82f6', bgColor: '#3b82f615' },
      LOW: { badge: '📌 Update', color: '#6b7280', bgColor: '#6b728015' },
    };
    const config = priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.MEDIUM;
    
    return {
      subject: `${priority === 'URGENT' ? '🚨 ' : ''}${title}`,
      html: generateEmailTemplate({
        preheader: shortDescription || `New announcement from code.scriet: ${title}`,
        badge: { text: config.badge, color: config.color, bgColor: config.bgColor },
        title: title,
        subtitle: shortDescription,
        body: `
          <div style="font-size: 15px; color: #d4d4d4; line-height: 1.7;">
            ${body.length > 600 ? body.substring(0, 600) + '...' : body}
          </div>
          
          ${tags && tags.length > 0 ? `
          <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #404040;">
            ${tags.map(tag => `
              <span style="display: inline-block; margin: 4px 6px 4px 0; padding: 4px 10px; background-color: #f59e0b20; color: #fbbf24; font-size: 11px; border-radius: 100px; font-weight: 500;">#${tag}</span>
            `).join('')}
          </div>
          ` : ''}
        `,
        cta: { text: 'Read Full Announcement', url: `${SITE_URL}/announcements/${slug}` },
        footer: 'Stay informed, stay ahead.',
      }),
      text: `[${priority}] ${title}\n\n${shortDescription || ''}\n\n${body}\n\nRead more: ${SITE_URL}/announcements/${slug}`,
    };
  },

  // New Event notification
  newEvent: (title: string, description: string, startDate: Date, slug: string, shortDescription?: string, location?: string, imageUrl?: string, tags?: string[], eventType?: string): EmailTemplate => ({
    subject: `🗓️ New Event: ${title}`,
    html: generateEmailTemplate({
      preheader: `${title} — ${startDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} ${location ? `at ${location}` : ''}`,
      badge: { text: eventType ? `🎯 ${eventType}` : '🎯 New Event', color: '#22c55e', bgColor: '#22c55e15' },
      title: title,
      subtitle: shortDescription || description.substring(0, 120),
      body: `
        <table style="width: 100%; background-color: #1f1f1f; border-radius: 8px; overflow: hidden; margin-bottom: 20px;" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="padding: 16px 20px; border-bottom: 1px solid #333;">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="width: 36px; vertical-align: top;">
                    <span style="font-size: 18px;">📅</span>
                  </td>
                  <td>
                    <span style="font-size: 14px; color: #fafafa; font-weight: 500;">${startDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 20px; ${location ? 'border-bottom: 1px solid #333;' : ''}">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="width: 36px; vertical-align: top;">
                    <span style="font-size: 18px;">⏰</span>
                  </td>
                  <td>
                    <span style="font-size: 14px; color: #fafafa; font-weight: 500;">${startDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${location ? `
          <tr>
            <td style="padding: 16px 20px;">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="width: 36px; vertical-align: top;">
                    <span style="font-size: 18px;">📍</span>
                  </td>
                  <td>
                    <span style="font-size: 14px; color: #fafafa; font-weight: 500;">${location}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ` : ''}
        </table>
        
        <p style="margin: 0; font-size: 14px; color: #a3a3a3; line-height: 1.6;">
          ${description.length > 300 ? description.substring(0, 300) + '...' : description}
        </p>
        
        ${tags && tags.length > 0 ? `
        <div style="margin-top: 16px;">
          ${tags.map(tag => `
            <span style="display: inline-block; margin: 4px 6px 4px 0; padding: 4px 10px; background-color: #f59e0b20; color: #fbbf24; font-size: 11px; border-radius: 100px; font-weight: 500;">#${tag}</span>
          `).join('')}
        </div>
        ` : ''}
      `,
      cta: { text: 'View & Register →', url: `${SITE_URL}/events/${slug}` },
      secondaryCta: { text: 'View all events', url: `${SITE_URL}/events` },
      footer: "Spots are limited — don't miss out! 🚀",
    }),
    text: `New Event: ${title}\n\nDate: ${startDate.toLocaleDateString()}\nTime: ${startDate.toLocaleTimeString()}\n${location ? `Location: ${location}\n` : ''}\n${description}\n\nRegister now: ${SITE_URL}/events/${slug}`,
  }),

  // Password reset
  passwordReset: (name: string, resetLink: string): EmailTemplate => ({
    subject: 'Reset your password 🔐',
    html: generateEmailTemplate({
      preheader: 'Password reset requested for your code.scriet account',
      badge: { text: '🔐 Security', color: '#3b82f6', bgColor: '#3b82f615' },
      title: 'Password Reset Request',
      subtitle: `Hey ${name}, we received a request to reset your password.`,
      body: `
        <p style="margin: 0 0 20px; font-size: 15px; color: #d4d4d4; line-height: 1.6;">
          Click the button below to create a new password. This link will expire in <strong style="color: #fafafa;">1 hour</strong>.
        </p>
        
        <div style="margin: 20px 0; padding: 16px 20px; background-color: #7f1d1d20; border: 1px solid #7f1d1d40; border-radius: 8px;">
          <p style="margin: 0; font-size: 13px; color: #fca5a5;">
            ⚠️ <strong>Didn't request this?</strong> You can safely ignore this email. Your password won't change unless you click the button above.
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
    subject: `⏰ Tomorrow: ${eventTitle}`,
    html: generateEmailTemplate({
      preheader: `Reminder: ${eventTitle} is happening tomorrow!`,
      badge: { text: '⏰ Reminder', color: '#eab308', bgColor: '#eab30815' },
      title: `It's almost time!`,
      subtitle: `"${eventTitle}" is happening tomorrow.`,
      body: `
        <p style="margin: 0 0 20px; font-size: 15px; color: #d4d4d4; line-height: 1.6;">
          Hey <strong style="color: #f59e0b;">${name}</strong>, just a friendly reminder that you're registered for an event tomorrow!
        </p>
        
        <table style="width: 100%; background-color: #1f1f1f; border-radius: 8px; overflow: hidden;" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="padding: 20px; text-align: center;">
              <span style="display: block; font-size: 13px; color: #737373; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">Event Time</span>
              <span style="font-size: 32px; font-weight: 700; color: #f59e0b;">${eventDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
              <span style="display: block; font-size: 14px; color: #a3a3a3; margin-top: 8px;">${eventDate.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
            </td>
          </tr>
        </table>
        
        <p style="margin: 20px 0 0; padding: 14px 18px; background-color: #14532d30; border-radius: 8px; font-size: 13px; color: #86efac;">
          ✓ Make sure you've reviewed any prerequisites and arrive a few minutes early!
        </p>
      `,
      cta: { text: 'View Event Details', url: `${SITE_URL}/events/${eventSlug}` },
      footer: 'See you tomorrow! 🎉',
    }),
    text: `Hi ${name}, reminder: ${eventTitle} is tomorrow at ${eventDate.toLocaleTimeString()}!`,
  }),

  // Registration opens notification
  registrationOpens: (eventTitle: string, startDate: Date, slug: string, shortDescription?: string, imageUrl?: string): EmailTemplate => ({
    subject: `🎫 Registration Open: ${eventTitle}`,
    html: generateEmailTemplate({
      preheader: `Registration is now open for ${eventTitle}!`,
      badge: { text: '🎫 Registration Open', color: '#22c55e', bgColor: '#22c55e15' },
      title: 'Registration Now Open!',
      subtitle: `Secure your spot for "${eventTitle}"`,
      body: `
        ${shortDescription ? `
        <p style="margin: 0 0 20px; font-size: 15px; color: #d4d4d4; line-height: 1.6;">
          ${shortDescription}
        </p>
        ` : ''}
        
        <table style="width: 100%; background-color: #1f1f1f; border-radius: 8px; overflow: hidden;" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="padding: 16px 20px; border-bottom: 1px solid #333;">
              <span style="font-size: 13px; color: #737373;">Event Date</span><br>
              <span style="font-size: 16px; color: #fafafa; font-weight: 500;">${startDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 20px;">
              <span style="font-size: 13px; color: #737373;">Time</span><br>
              <span style="font-size: 16px; color: #fafafa; font-weight: 500;">${startDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
            </td>
          </tr>
        </table>
        
        <p style="margin: 20px 0 0; padding: 14px 18px; background-color: #422006; border-radius: 8px; font-size: 13px; color: #fcd34d;">
          🏃 <strong>Hurry!</strong> Spots are limited and fill up fast.
        </p>
      `,
      cta: { text: 'Register Now →', url: `${SITE_URL}/events/${slug}` },
      footer: "Don't miss out! 🚀",
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
      // Format recipients for Brevo
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
        textContent: options.text || '',
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
        throw new Error(`Brevo API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      logger.info('📧 Email sent successfully via Brevo', {
        messageId: result.messageId,
        recipients: recipients.length,
        subject: options.subject,
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

  // Send to multiple recipients in batches (Brevo limit is 2000 per request)
  async sendBulk(emails: string[], subject: string, html: string, text?: string): Promise<boolean> {
    if (!this.configured || emails.length === 0) {
      return false;
    }

    const BATCH_SIZE = 50; // Use smaller batches for better deliverability
    const batches: string[][] = [];
    
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      batches.push(emails.slice(i, i + BATCH_SIZE));
    }

    logger.info(`📧 Sending bulk email to ${emails.length} recipients in ${batches.length} batches`);

    let allSuccessful = true;
    for (const batch of batches) {
      const success = await this.send({ to: batch, subject, html, text });
      if (!success) allSuccessful = false;
      // Small delay between batches to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return allSuccessful;
  }

  // Welcome email for new users
  async sendWelcome(email: string, name: string, clubName: string = 'code.scriet'): Promise<boolean> {
    const template = EmailTemplates.welcome(name, clubName);
    return this.send({ to: email, ...template });
  }

  // Event registration confirmation
  async sendEventRegistration(email: string, name: string, eventTitle: string, eventDate: Date, eventSlug: string, location?: string, imageUrl?: string): Promise<boolean> {
    const template = EmailTemplates.eventRegistration(name, eventTitle, eventDate, eventSlug, location, imageUrl);
    return this.send({ to: email, ...template });
  }

  // New announcement notification to all users
  async sendAnnouncementToAll(emails: string[], title: string, body: string, priority: string, slug: string, shortDescription?: string, imageUrl?: string, tags?: string[]): Promise<boolean> {
    const template = EmailTemplates.newAnnouncement(title, body, priority, slug, shortDescription, imageUrl, tags);
    return this.sendBulk(emails, template.subject, template.html, template.text);
  }

  // New event notification to all users
  async sendNewEventToAll(emails: string[], title: string, description: string, startDate: Date, slug: string, shortDescription?: string, location?: string, imageUrl?: string, tags?: string[], eventType?: string): Promise<boolean> {
    const template = EmailTemplates.newEvent(title, description, startDate, slug, shortDescription, location, imageUrl, tags, eventType);
    return this.sendBulk(emails, template.subject, template.html, template.text);
  }

  // Password reset email
  async sendPasswordReset(email: string, name: string, resetLink: string): Promise<boolean> {
    const template = EmailTemplates.passwordReset(name, resetLink);
    return this.send({ to: email, ...template });
  }

  // Event reminder (day before)
  async sendEventReminder(email: string, name: string, eventTitle: string, eventDate: Date, eventSlug: string): Promise<boolean> {
    const template = EmailTemplates.eventReminder(name, eventTitle, eventDate, eventSlug);
    return this.send({ to: email, ...template });
  }

  // Registration opens notification
  async sendRegistrationOpens(emails: string[], eventTitle: string, startDate: Date, slug: string, shortDescription?: string, imageUrl?: string): Promise<boolean> {
    const template = EmailTemplates.registrationOpens(eventTitle, startDate, slug, shortDescription, imageUrl);
    return this.sendBulk(emails, template.subject, template.html, template.text);
  }

  // Check if email service is configured
  isConfigured(): boolean {
    return this.configured;
  }
}

export const emailService = new EmailService();
