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
// Stunning Email Template Generator
// Ultra-modern design with glassmorphism & gradients
// ============================================

const generateEmailTemplate = (content: {
  preheader?: string;
  badge?: { text: string; emoji?: string; gradient: string };
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
      <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.05);">
        <table cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
          <tr>
            <td style="width: 44px; vertical-align: middle;">
              <div style="width: 36px; height: 36px; background: linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(234,88,12,0.2) 100%); border-radius: 10px; text-align: center; line-height: 36px; font-size: 18px;">${card.icon}</div>
            </td>
            <td style="vertical-align: middle; padding-left: 12px;">
              <span style="display: block; font-size: 11px; color: #737373; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">${card.label}</span>
              <span style="font-size: 15px; color: #fafafa; font-weight: 500;">${card.value}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('') || '';

  const tagsHtml = content.tags?.map(tag => `
    <span style="display: inline-block; margin: 3px 4px 3px 0; padding: 4px 12px; background: linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(234,88,12,0.15) 100%); color: #fbbf24; font-size: 11px; border-radius: 100px; font-weight: 500; border: 1px solid rgba(245,158,11,0.2);">#${tag}</span>
  `).join('') || '';

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
</head>
<body style="margin: 0; width: 100%; padding: 0; word-break: break-word; -webkit-font-smoothing: antialiased; background-color: #000000;">
  ${content.preheader ? `<div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">${content.preheader}${'&nbsp;'.repeat(100)}</div>` : ''}
  
  <div role="article" aria-roledescription="email" aria-label="Email from code.scriet" lang="en" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    
    <!-- Background Container -->
    <table style="width: 100%; background: linear-gradient(180deg, #000000 0%, #0a0a0a 100%); min-height: 100vh;" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td align="center" style="padding: 48px 20px;">
          
          <!-- Decorative Top Glow -->
          <div style="width: 200px; height: 200px; background: radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%); position: absolute; top: 0; left: 50%; transform: translateX(-50%); pointer-events: none;"></div>
          
          <!-- Main Card -->
          <table style="width: 100%; max-width: 600px; border-radius: 24px; overflow: hidden; background: linear-gradient(180deg, #141414 0%, #0f0f0f 100%); border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);" cellpadding="0" cellspacing="0" role="presentation">
            
            <!-- Header Section -->
            <tr>
              <td style="padding: 0;">
                <!-- Gradient Header Bar -->
                <div style="height: 4px; background: linear-gradient(90deg, #f59e0b 0%, #ea580c 33%, #dc2626 66%, #f59e0b 100%);"></div>
                
                <!-- Logo Area -->
                <table style="width: 100%; background: linear-gradient(180deg, rgba(245,158,11,0.08) 0%, transparent 100%);" cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td style="padding: 32px 40px 24px; text-align: center;">
                      <!-- Code Logo -->
                      <div style="display: inline-block;">
                        <div style="background: linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(234,88,12,0.1) 100%); border: 1px solid rgba(245,158,11,0.2); border-radius: 16px; padding: 14px 28px; display: inline-block;">
                          <span style="font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; font-size: 26px; font-weight: 700; background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #ea580c 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                            &lt;code.scriet/&gt;
                          </span>
                        </div>
                      </div>
                      <p style="margin: 12px 0 0; font-size: 12px; color: #525252; text-transform: uppercase; letter-spacing: 3px; font-weight: 500;">The Coding Club • SCRIET</p>
                    </td>
                  </tr>
                </table>
                
                <!-- Terminal Window Decoration -->
                <table style="width: 100%; background-color: #1a1a1a; border-top: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05);" cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td style="padding: 10px 24px;">
                      <table style="width: 100%;" cellpadding="0" cellspacing="0" role="presentation">
                        <tr>
                          <td>
                            <span style="display: inline-block; width: 12px; height: 12px; background: linear-gradient(135deg, #ff5f57 0%, #ff3b30 100%); border-radius: 50%; margin-right: 8px; box-shadow: 0 0 8px rgba(255,95,87,0.4);"></span>
                            <span style="display: inline-block; width: 12px; height: 12px; background: linear-gradient(135deg, #febc2e 0%, #ffcc00 100%); border-radius: 50%; margin-right: 8px; box-shadow: 0 0 8px rgba(254,188,46,0.4);"></span>
                            <span style="display: inline-block; width: 12px; height: 12px; background: linear-gradient(135deg, #28c840 0%, #32d74b 100%); border-radius: 50%; box-shadow: 0 0 8px rgba(40,200,64,0.4);"></span>
                          </td>
                          <td style="text-align: right;">
                            <span style="font-family: 'SF Mono', 'Consolas', monospace; font-size: 11px; color: #525252;">~/codescriet/mail</span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            
            ${content.heroImage ? `
            <!-- Hero Image -->
            <tr>
              <td style="padding: 0;">
                <img src="${content.heroImage}" alt="" style="width: 100%; height: auto; display: block; max-height: 240px; object-fit: cover;" />
              </td>
            </tr>
            ` : ''}
            
            <!-- Main Content -->
            <tr>
              <td style="padding: 36px 40px 32px;">
                
                ${content.badge ? `
                <!-- Badge -->
                <table cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td style="padding-bottom: 20px;">
                      <span style="display: inline-block; padding: 8px 16px; background: ${content.badge.gradient}; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; border-radius: 100px; color: #fafafa; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
                        ${content.badge.emoji ? `<span style="margin-right: 6px;">${content.badge.emoji}</span>` : ''}${content.badge.text}
                      </span>
                    </td>
                  </tr>
                </table>
                ` : ''}
                
                <!-- Title -->
                <h1 style="margin: 0 0 12px; font-size: 32px; font-weight: 800; color: #fafafa; line-height: 1.2; letter-spacing: -0.5px;">
                  ${content.title}
                </h1>
                
                ${content.subtitle ? `
                <p style="margin: 0 0 28px; font-size: 16px; color: #a3a3a3; line-height: 1.6;">
                  ${content.subtitle}
                </p>
                ` : ''}
                
                ${content.infoCards && content.infoCards.length > 0 ? `
                <!-- Info Cards -->
                <table style="width: 100%; margin: 24px 0; background: linear-gradient(135deg, rgba(38,38,38,0.8) 0%, rgba(23,23,23,0.8) 100%); border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05);" cellpadding="0" cellspacing="0" role="presentation">
                  ${infoCardsHtml}
                </table>
                ` : ''}
                
                <!-- Body Content -->
                <div style="margin: 24px 0; padding: 28px; background: linear-gradient(135deg, rgba(38,38,38,0.6) 0%, rgba(26,26,26,0.6) 100%); border-radius: 16px; border-left: 4px solid; border-image: linear-gradient(180deg, #f59e0b 0%, #ea580c 100%) 1; border-top: 1px solid rgba(255,255,255,0.05); border-right: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05);">
                  ${content.body}
                </div>
                
                ${content.tags && content.tags.length > 0 ? `
                <!-- Tags -->
                <div style="margin: 20px 0;">
                  ${tagsHtml}
                </div>
                ` : ''}
                
                ${content.cta ? `
                <!-- Primary CTA Button -->
                <table style="width: 100%;" cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td align="center" style="padding: 28px 0 12px;">
                      <a href="${content.cta.url}" style="display: inline-block; padding: 18px 48px; background: linear-gradient(135deg, #f59e0b 0%, #ea580c 50%, #dc2626 100%); color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 14px; box-shadow: 0 8px 24px rgba(245,158,11,0.35), 0 4px 8px rgba(0,0,0,0.3); text-transform: uppercase; letter-spacing: 1px;">
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
                      <a href="${content.secondaryCta.url}" style="font-size: 14px; color: #f59e0b; text-decoration: none; font-weight: 500;">
                        ${content.secondaryCta.text} →
                      </a>
                    </td>
                  </tr>
                </table>
                ` : ''}
                
              </td>
            </tr>
            
            <!-- Divider -->
            <tr>
              <td style="padding: 0 40px;">
                <div style="height: 1px; background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%);"></div>
              </td>
            </tr>
            
            <!-- Footer -->
            <tr>
              <td style="padding: 32px 40px 40px; text-align: center;">
                
                <!-- Quick Links -->
                <table style="width: 100%; margin-bottom: 24px;" cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td align="center">
                      <a href="${SITE_URL}" style="display: inline-block; margin: 0 6px; padding: 10px 18px; background: rgba(255,255,255,0.05); color: #a3a3a3; font-size: 12px; text-decoration: none; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); font-weight: 500;">Website</a>
                      <a href="${SITE_URL}/events" style="display: inline-block; margin: 0 6px; padding: 10px 18px; background: rgba(255,255,255,0.05); color: #a3a3a3; font-size: 12px; text-decoration: none; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); font-weight: 500;">Events</a>
                      <a href="${SITE_URL}/announcements" style="display: inline-block; margin: 0 6px; padding: 10px 18px; background: rgba(255,255,255,0.05); color: #a3a3a3; font-size: 12px; text-decoration: none; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); font-weight: 500;">Updates</a>
                    </td>
                  </tr>
                </table>
                
                <!-- Branding -->
                <p style="margin: 0 0 6px; font-family: 'SF Mono', 'Consolas', monospace; font-size: 16px; background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #ea580c 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; font-weight: 700;">
                  &lt;code.scriet/&gt;
                </p>
                <p style="margin: 0 0 16px; font-size: 13px; color: #525252; font-weight: 400;">
                  ${content.footer || 'Building the next generation of developers.'}
                </p>
                <p style="margin: 0; font-size: 11px; color: #404040;">
                  SCRIET, CCS University, Meerut
                </p>
              </td>
            </tr>
            
          </table>
          
          <!-- Legal Footer -->
          <table style="width: 100%; max-width: 600px;" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="padding: 28px 20px; text-align: center;">
                <p style="margin: 0; font-size: 11px; color: #404040; line-height: 1.7;">
                  You're receiving this because you're part of the code.scriet community.<br>
                  <a href="${SITE_URL}/dashboard" style="color: #525252; text-decoration: underline;">Manage preferences</a> · 
                  <a href="${SITE_URL}" style="color: #525252; text-decoration: underline;">Visit website</a>
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
  // Welcome email for new members - PREMIUM DESIGN
  welcome: (name: string, clubName: string, customBody?: string, customFooter?: string): EmailTemplate => {
    // If custom body provided, use it; otherwise use default premium template
    const bodyContent = customBody 
      ? markdownToEmailHtml(customBody.replace(/\{\{name\}\}/g, name).replace(/\{\{clubName\}\}/g, clubName))
      : `
        <p style="margin: 0 0 28px; font-size: 16px; color: #e5e5e5; line-height: 1.8;">
          You're not just joining a club. You're stepping into a <strong style="color: #f59e0b;">high-performance community</strong> where real developers solve real problems, ship real projects, and grow together.
        </p>
        
        <p style="margin: 0 0 20px; font-size: 14px; color: #a3a3a3; font-weight: 500; text-transform: uppercase; letter-spacing: 2px;">YOUR POWER-UPS</p>
        
        <!-- Feature Grid -->
        <table style="width: 100%; margin-bottom: 28px;" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="width: 50%; padding-right: 8px; padding-bottom: 12px; vertical-align: top;">
              <table style="width: 100%; background: linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(234,88,12,0.08) 100%); border: 1px solid rgba(245,158,11,0.15); border-radius: 14px; padding: 16px;" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td>
                    <div style="font-size: 28px; margin-bottom: 8px;">💡</div>
                    <p style="margin: 0 0 4px; font-size: 14px; font-weight: 600; color: #fafafa;">Daily QOTD</p>
                    <p style="margin: 0; font-size: 12px; color: #a3a3a3; line-height: 1.5;">Master algorithms &amp; data structures</p>
                  </td>
                </tr>
              </table>
            </td>
            <td style="width: 50%; padding-left: 8px; padding-bottom: 12px; vertical-align: top;">
              <table style="width: 100%; background: linear-gradient(135deg, rgba(34,197,94,0.12) 0%, rgba(22,163,74,0.08) 100%); border: 1px solid rgba(34,197,94,0.15); border-radius: 14px; padding: 16px;" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td>
                    <div style="font-size: 28px; margin-bottom: 8px;">🎯</div>
                    <p style="margin: 0 0 4px; font-size: 14px; font-weight: 600; color: #fafafa;">Live Events</p>
                    <p style="margin: 0; font-size: 12px; color: #a3a3a3; line-height: 1.5;">Workshops &amp; hackathons</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="width: 50%; padding-right: 8px; padding-top: 0; vertical-align: top;">
              <table style="width: 100%; background: linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(37,99,235,0.08) 100%); border: 1px solid rgba(59,130,246,0.15); border-radius: 14px; padding: 16px;" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td>
                    <div style="font-size: 28px; margin-bottom: 8px;">📊</div>
                    <p style="margin: 0 0 4px; font-size: 14px; font-weight: 600; color: #fafafa;">Leaderboard</p>
                    <p style="margin: 0; font-size: 12px; color: #a3a3a3; line-height: 1.5;">Climb the ranks</p>
                  </td>
                </tr>
              </table>
            </td>
            <td style="width: 50%; padding-left: 8px; padding-top: 0; vertical-align: top;">
              <table style="width: 100%; background: linear-gradient(135deg, rgba(168,85,247,0.12) 0%, rgba(147,51,234,0.08) 100%); border: 1px solid rgba(168,85,247,0.15); border-radius: 14px; padding: 16px;" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td>
                    <div style="font-size: 28px; margin-bottom: 8px;">👥</div>
                    <p style="margin: 0 0 4px; font-size: 14px; font-weight: 600; color: #fafafa;">Community</p>
                    <p style="margin: 0; font-size: 12px; color: #a3a3a3; line-height: 1.5;">100+ builders</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        
        <!-- What Happens Next -->
        <div style="margin: 28px 0; padding: 24px; background: linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(234,88,12,0.04) 100%); border: 1px solid rgba(245,158,11,0.2); border-radius: 16px;">
          <p style="margin: 0 0 16px; font-size: 13px; text-transform: uppercase; letter-spacing: 2px; color: #f59e0b; font-weight: 600;">NEXT STEPS</p>
          <table style="width: 100%;" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <table cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td style="width: 32px; padding-right: 12px; vertical-align: top;">
                      <div style="width: 28px; height: 28px; background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%); border-radius: 50%; text-align: center; line-height: 28px; color: #000; font-weight: 700; font-size: 14px;">1</div>
                    </td>
                    <td style="vertical-align: middle;">
                      <p style="margin: 0; color: #fafafa; font-size: 15px; font-weight: 500;">Complete your profile</p>
                      <p style="margin: 4px 0 0; color: #a3a3a3; font-size: 13px;">Add your bio, social links, and skill set</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <table cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td style="width: 32px; padding-right: 12px; vertical-align: top;">
                      <div style="width: 28px; height: 28px; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); border-radius: 50%; text-align: center; line-height: 28px; color: #000; font-weight: 700; font-size: 14px;">2</div>
                    </td>
                    <td style="vertical-align: middle;">
                      <p style="margin: 0; color: #fafafa; font-size: 15px; font-weight: 500;">Solve today's QOTD</p>
                      <p style="margin: 4px 0 0; color: #a3a3a3; font-size: 13px;">Sharpen your skills and climb the leaderboard</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 0;">
                <table cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td style="width: 32px; padding-right: 12px; vertical-align: top;">
                      <div style="width: 28px; height: 28px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border-radius: 50%; text-align: center; line-height: 28px; color: #fff; font-weight: 700; font-size: 14px;">3</div>
                    </td>
                    <td style="vertical-align: middle;">
                      <p style="margin: 0; color: #fafafa; font-size: 15px; font-weight: 500;">Register for an event</p>
                      <p style="margin: 4px 0 0; color: #a3a3a3; font-size: 13px;">Meet the community and level up your skills</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
        
        <!-- Premium Touch -->
        <div style="margin: 28px 0 0; padding: 20px; background: linear-gradient(90deg, rgba(168,85,247,0.1) 0%, rgba(59,130,246,0.1) 100%); border-radius: 12px; border: 1px solid rgba(168,85,247,0.15); text-align: center;">
          <p style="margin: 0; font-size: 13px; color: #c4b5fd; font-weight: 500;">
            💪 <strong>Pro tip:</strong> The best learners are the ones who show up consistently. See you tomorrow?
          </p>
        </div>
      `;
    
    return {
      subject: `${name}, welcome to ${clubName} 🔥`,
      html: generateEmailTemplate({
        preheader: `You're in. Let's build something amazing together.`,
        badge: { text: 'You\'re In!', emoji: '🚀', gradient: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 50%, #dc2626 100%)' },
        title: `Welcome to the Elite ${name}`,
        subtitle: `You just joined 100+ developers building the future. Time to level up. 🎯`,
        body: bodyContent,
        cta: { text: 'Launch Your Dashboard →', url: `${SITE_URL}/dashboard` },
        footer: customFooter || 'Welcome to the winning team. Let\'s build something extraordinary.',
      }),
      text: `Welcome to ${clubName}, ${name}! You're now part of a community of 100+ developers building amazing projects. Visit ${SITE_URL}/dashboard to get started.`,
    };
  },

  // Event registration confirmation
  eventRegistration: (name: string, eventTitle: string, eventDate: Date, eventSlug: string, location?: string, imageUrl?: string): EmailTemplate => ({
    subject: `🎫 You're registered: ${eventTitle}`,
    html: generateEmailTemplate({
      preheader: `Your spot for ${eventTitle} is confirmed!`,
      badge: { text: 'Registered', emoji: '✓', gradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' },
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
        
        <div style="padding: 14px 18px; background: rgba(34,197,94,0.1); border-radius: 10px; border: 1px solid rgba(34,197,94,0.2);">
          <p style="margin: 0; font-size: 13px; color: #86efac;">
            💡 <strong>Pro tip:</strong> Add this to your calendar and arrive 5-10 minutes early!
          </p>
        </div>
      `,
      cta: { text: 'View Event', url: `${SITE_URL}/events/${eventSlug}` },
      footer: 'See you there! 🎉',
    }),
    text: `Hi ${name}, you're registered for ${eventTitle} on ${eventDate.toLocaleDateString()}. See you there!`,
  }),

  // New Announcement notification
  newAnnouncement: (title: string, body: string, priority: string, slug: string, shortDescription?: string, imageUrl?: string, tags?: string[], customIntro?: string, customFooter?: string): EmailTemplate => {
    const priorityConfig = {
      URGENT: { text: 'Urgent', emoji: '🚨', gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' },
      HIGH: { text: 'Important', emoji: '⚡', gradient: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)' },
      MEDIUM: { text: 'Announcement', emoji: '📢', gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' },
      LOW: { text: 'Update', emoji: '📌', gradient: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)' },
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
    // Add custom intro if provided
    const bodyContent = customIntro
      ? `<div style="margin-bottom: 16px;">${markdownToEmailHtml(customIntro)}</div><p style="margin: 0; font-size: 15px; color: #d4d4d4; line-height: 1.7;">${description.length > 400 ? description.substring(0, 400) + '...' : description}</p>`
      : `<p style="margin: 0; font-size: 15px; color: #d4d4d4; line-height: 1.7;">${description.length > 400 ? description.substring(0, 400) + '...' : description}</p>`;
    
    return {
      subject: `🗓️ New Event: ${title}`,
      html: generateEmailTemplate({
        preheader: `${title} — ${startDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} ${location ? `at ${location}` : ''}`,
        badge: { text: eventType || 'New Event', emoji: '🎯', gradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' },
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
        footer: customFooter || "Limited spots available — don't miss out! 🚀",
      }),
      text: `New Event: ${title}\n\nDate: ${startDate.toLocaleDateString()}\nTime: ${startDate.toLocaleTimeString()}\n${location ? `Location: ${location}\n` : ''}\n${description}\n\nRegister now: ${SITE_URL}/events/${slug}`,
    };
  },

  // Password reset
  passwordReset: (name: string, resetLink: string): EmailTemplate => ({
    subject: '🔐 Reset your password',
    html: generateEmailTemplate({
      preheader: 'Password reset requested for your code.scriet account',
      badge: { text: 'Security', emoji: '🔐', gradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' },
      title: 'Password Reset',
      subtitle: `Hey ${name}, we received a request to reset your password.`,
      body: `
        <p style="margin: 0 0 20px; font-size: 15px; color: #e5e5e5; line-height: 1.6;">
          Click the button below to create a new password. This link expires in <strong style="color: #fafafa;">1 hour</strong>.
        </p>
        
        <div style="padding: 14px 18px; background: rgba(239,68,68,0.1); border-radius: 10px; border: 1px solid rgba(239,68,68,0.2);">
          <p style="margin: 0; font-size: 13px; color: #fca5a5;">
            ⚠️ <strong>Didn't request this?</strong> Ignore this email — your password won't change.
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
      badge: { text: 'Reminder', emoji: '⏰', gradient: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)' },
      title: `It's almost time!`,
      subtitle: `"${eventTitle}" is happening tomorrow.`,
      infoCards: [
        { icon: '📅', label: 'Date', value: eventDate.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' }) },
        { icon: '⏰', label: 'Time', value: eventDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) },
      ],
      body: `
        <p style="margin: 0 0 16px; font-size: 15px; color: #e5e5e5; line-height: 1.6;">
          Hey <strong style="color: #f59e0b;">${name}</strong>, just a friendly reminder about your upcoming event!
        </p>
        
        <div style="padding: 14px 18px; background: rgba(34,197,94,0.1); border-radius: 10px; border: 1px solid rgba(34,197,94,0.2);">
          <p style="margin: 0; font-size: 13px; color: #86efac;">
            ✓ Review any prerequisites and arrive a few minutes early!
          </p>
        </div>
      `,
      cta: { text: 'View Event', url: `${SITE_URL}/events/${eventSlug}` },
      footer: 'See you tomorrow! 🎉',
    }),
    text: `Hi ${name}, reminder: ${eventTitle} is tomorrow at ${eventDate.toLocaleTimeString()}!`,
  }),

  // Registration opens notification
  registrationOpens: (eventTitle: string, startDate: Date, slug: string, shortDescription?: string, imageUrl?: string): EmailTemplate => ({
    subject: `🎫 Registration Open: ${eventTitle}`,
    html: generateEmailTemplate({
      preheader: `Registration is now open for ${eventTitle}!`,
      badge: { text: 'Registration Open', emoji: '🎫', gradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' },
      title: 'Registration Open!',
      subtitle: `Secure your spot for "${eventTitle}"`,
      heroImage: imageUrl,
      infoCards: [
        { icon: '📅', label: 'Event Date', value: startDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) },
        { icon: '⏰', label: 'Time', value: startDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) },
      ],
      body: `
        ${shortDescription ? `<p style="margin: 0 0 16px; font-size: 15px; color: #e5e5e5; line-height: 1.6;">${shortDescription}</p>` : ''}
        
        <div style="padding: 14px 18px; background: rgba(245,158,11,0.1); border-radius: 10px; border: 1px solid rgba(245,158,11,0.2);">
          <p style="margin: 0; font-size: 13px; color: #fcd34d;">
            🏃 <strong>Hurry!</strong> Spots are limited and fill up fast.
          </p>
        </div>
      `,
      cta: { text: 'Register Now', url: `${SITE_URL}/events/${slug}` },
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
