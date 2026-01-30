// Email service for notifications using Brevo (formerly Sendinblue)
// Professional email notifications for announcements, events, and user actions

import { logger } from './logger.js';

// Brevo API configuration
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@codescriet.com';
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'code.scriet';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://codescriet.com';

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

// Base email styles - Consistent amber/orange theme
const baseStyles = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body { 
      font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      background: linear-gradient(135deg, #0c0a09 0%, #1c1917 50%, #292524 100%);
      margin: 0; 
      padding: 40px 20px;
      min-height: 100vh;
    }
    
    .email-wrapper {
      max-width: 640px;
      margin: 0 auto;
    }
    
    .container { 
      background: linear-gradient(180deg, #1c1917 0%, #0c0a09 100%);
      border: 1px solid #44403c;
      border-radius: 16px; 
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    
    .header { 
      background: linear-gradient(135deg, #f59e0b 0%, #ea580c 50%, #dc2626 100%);
      padding: 32px 40px;
      text-align: center;
    }
    
    .logo { 
      font-size: 28px; 
      font-weight: 700; 
      color: white;
      text-shadow: 0 2px 4px rgba(0,0,0,0.2);
      letter-spacing: -0.5px;
    }
    
    .logo span { 
      color: rgba(255,255,255,0.9);
      font-weight: 400;
    }
    
    .hero-image {
      width: 100%;
      height: 200px;
      object-fit: cover;
      display: block;
    }
    
    .content-wrapper {
      padding: 40px;
    }
    
    .badge {
      display: inline-block;
      padding: 6px 16px;
      border-radius: 100px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 16px;
    }
    
    .badge-announcement { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .badge-event { background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
    .badge-urgent { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
    .badge-high { background: rgba(249, 115, 22, 0.2); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.3); }
    .badge-welcome { background: rgba(139, 92, 246, 0.2); color: #a78bfa; border: 1px solid rgba(139, 92, 246, 0.3); }
    .badge-reminder { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
    
    h1 { 
      color: #fafaf9; 
      font-size: 28px;
      font-weight: 700;
      line-height: 1.3;
      margin-bottom: 16px;
      letter-spacing: -0.5px;
    }
    
    h2 {
      color: #fafaf9;
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    
    .subtitle {
      color: #a8a29e;
      font-size: 16px;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    
    .content { 
      color: #d6d3d1; 
      line-height: 1.7;
      font-size: 15px;
    }
    
    .content p {
      margin-bottom: 16px;
    }
    
    .content ul {
      margin: 16px 0;
      padding-left: 24px;
    }
    
    .content li {
      margin-bottom: 8px;
      color: #d6d3d1;
    }
    
    .highlight-box {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(234, 88, 12, 0.1) 100%);
      border: 1px solid rgba(245, 158, 11, 0.2);
      border-radius: 12px;
      padding: 24px;
      margin: 24px 0;
    }
    
    .event-details {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid #44403c;
      border-radius: 12px;
      padding: 24px;
      margin: 24px 0;
    }
    
    .detail-row {
      display: flex;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid #44403c;
    }
    
    .detail-row:last-child {
      border-bottom: none;
    }
    
    .detail-icon {
      font-size: 20px;
      margin-right: 16px;
      width: 24px;
      text-align: center;
    }
    
    .detail-label {
      color: #78716c;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    
    .detail-value {
      color: #fafaf9;
      font-size: 15px;
      font-weight: 500;
    }
    
    .button-wrapper {
      text-align: center;
      margin: 32px 0;
    }
    
    .button { 
      display: inline-block; 
      background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%);
      color: white !important; 
      padding: 16px 40px; 
      border-radius: 12px; 
      text-decoration: none; 
      font-weight: 600;
      font-size: 16px;
      letter-spacing: 0.3px;
      box-shadow: 0 4px 14px rgba(245, 158, 11, 0.4);
      transition: all 0.2s ease;
    }
    
    .button:hover {
      box-shadow: 0 6px 20px rgba(245, 158, 11, 0.5);
    }
    
    .button-secondary {
      background: transparent;
      border: 2px solid #f59e0b;
      color: #f59e0b !important;
      box-shadow: none;
    }
    
    .divider {
      height: 1px;
      background: linear-gradient(to right, transparent, #44403c, transparent);
      margin: 32px 0;
    }
    
    .footer { 
      background: rgba(0, 0, 0, 0.3);
      padding: 32px 40px;
      text-align: center;
      border-top: 1px solid #44403c;
    }
    
    .footer-logo {
      font-size: 20px;
      font-weight: 700;
      color: #f59e0b;
      margin-bottom: 12px;
    }
    
    .footer-text {
      color: #78716c;
      font-size: 13px;
      line-height: 1.6;
    }
    
    .footer-links {
      margin-top: 16px;
    }
    
    .footer-link {
      color: #a8a29e;
      text-decoration: none;
      font-size: 13px;
      margin: 0 12px;
    }
    
    .footer-link:hover {
      color: #f59e0b;
    }
    
    .social-links {
      margin-top: 20px;
    }
    
    .social-link {
      display: inline-block;
      width: 36px;
      height: 36px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid #44403c;
      border-radius: 8px;
      margin: 0 6px;
      line-height: 36px;
      text-decoration: none;
      font-size: 16px;
    }
    
    .tags {
      margin-top: 16px;
    }
    
    .tag {
      display: inline-block;
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      padding: 4px 12px;
      border-radius: 100px;
      font-size: 12px;
      font-weight: 500;
      margin: 4px 4px 4px 0;
    }
    
    .warning-box {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      border-radius: 12px;
      padding: 16px 20px;
      margin: 20px 0;
      color: #fca5a5;
      font-size: 14px;
    }
    
    .info-box {
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: 12px;
      padding: 16px 20px;
      margin: 20px 0;
      color: #93c5fd;
      font-size: 14px;
    }
    
    @media (max-width: 480px) {
      body { padding: 20px 12px; }
      .content-wrapper { padding: 24px; }
      .footer { padding: 24px; }
      h1 { font-size: 24px; }
      .button { padding: 14px 28px; }
    }
  </style>
`;

// Email templates
export const EmailTemplates = {
  welcome: (name: string, clubName: string): EmailTemplate => ({
    subject: `Welcome to ${clubName}! 🎉`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${baseStyles}
      </head>
      <body>
        <div class="email-wrapper">
          <div class="container">
            <div class="header">
              <div class="logo">code<span>.scriet</span></div>
            </div>
            <div class="content-wrapper">
              <span class="badge badge-welcome">🎉 Welcome</span>
              <h1>Hey ${name}, Welcome to the Club!</h1>
              <p class="subtitle">You're now part of an amazing community of passionate developers.</p>
              
              <div class="content">
                <p>We're absolutely thrilled to have you join <strong style="color: #fbbf24;">${clubName}</strong>! You've just taken the first step towards an incredible journey of learning, building, and growing together.</p>
                
                <div class="highlight-box">
                  <h2>Here's what you can do:</h2>
                  <ul>
                    <li>🎯 <strong>Daily Challenges</strong> - Solve the Question of the Day (QOTD)</li>
                    <li>📅 <strong>Events & Workshops</strong> - Register for exciting learning opportunities</li>
                    <li>🏆 <strong>Leaderboard</strong> - Track your progress and compete</li>
                    <li>📢 <strong>Stay Updated</strong> - Get the latest announcements</li>
                    <li>👥 <strong>Connect</strong> - Network with fellow developers</li>
                  </ul>
                </div>
              </div>
              
              <div class="button-wrapper">
                <a href="${FRONTEND_URL}/dashboard" class="button">Explore Your Dashboard →</a>
              </div>
            </div>
            <div class="footer">
              <div class="footer-logo">code.scriet</div>
              <p class="footer-text">Happy coding! 🚀<br>The code.scriet Team</p>
              <div class="footer-links">
                <a href="${FRONTEND_URL}" class="footer-link">Website</a>
                <a href="${FRONTEND_URL}/events" class="footer-link">Events</a>
                <a href="${FRONTEND_URL}/announcements" class="footer-link">Announcements</a>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Welcome to ${clubName}, ${name}! We're thrilled to have you join us. Visit ${FRONTEND_URL} to get started.`,
  }),

  eventRegistration: (name: string, eventTitle: string, eventDate: Date, eventSlug: string, location?: string, imageUrl?: string): EmailTemplate => ({
    subject: `You're registered for ${eventTitle}! ✅`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${baseStyles}
      </head>
      <body>
        <div class="email-wrapper">
          <div class="container">
            <div class="header">
              <div class="logo">code<span>.scriet</span></div>
            </div>
            ${imageUrl ? `<img src="${imageUrl}" alt="${eventTitle}" class="hero-image" />` : ''}
            <div class="content-wrapper">
              <span class="badge badge-event">✅ Registration Confirmed</span>
              <h1>${eventTitle}</h1>
              <p class="subtitle">You're all set! Your spot has been reserved.</p>
              
              <div class="content">
                <p>Hi <strong style="color: #fbbf24;">${name}</strong>,</p>
                <p>Great news! You've successfully registered for the event. Here are the details:</p>
                
                <div class="event-details">
                  <div class="detail-row">
                    <span class="detail-icon">📅</span>
                    <div>
                      <div class="detail-label">Date</div>
                      <div class="detail-value">${eventDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                    </div>
                  </div>
                  <div class="detail-row">
                    <span class="detail-icon">⏰</span>
                    <div>
                      <div class="detail-label">Time</div>
                      <div class="detail-value">${eventDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                  ${location ? `
                  <div class="detail-row">
                    <span class="detail-icon">📍</span>
                    <div>
                      <div class="detail-label">Location</div>
                      <div class="detail-value">${location}</div>
                    </div>
                  </div>
                  ` : ''}
                </div>
                
                <div class="info-box">
                  💡 <strong>Tip:</strong> Add this event to your calendar so you don't miss it!
                </div>
              </div>
              
              <div class="button-wrapper">
                <a href="${FRONTEND_URL}/events/${eventSlug}" class="button">View Event Details →</a>
              </div>
            </div>
            <div class="footer">
              <div class="footer-logo">code.scriet</div>
              <p class="footer-text">See you there! 🎉<br>The code.scriet Team</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Hi ${name}, you're registered for ${eventTitle} on ${eventDate.toLocaleDateString()}. See you there!`,
  }),

  // New Announcement - Beautiful notification for all users
  newAnnouncement: (title: string, body: string, priority: string, slug: string, shortDescription?: string, imageUrl?: string, tags?: string[]): EmailTemplate => ({
    subject: `${priority === 'URGENT' ? '🚨 ' : priority === 'HIGH' ? '⚡ ' : '📢 '}${title}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${baseStyles}
      </head>
      <body>
        <div class="email-wrapper">
          <div class="container">
            <div class="header">
              <div class="logo">code<span>.scriet</span></div>
            </div>
            ${imageUrl ? `<img src="${imageUrl}" alt="${title}" class="hero-image" />` : ''}
            <div class="content-wrapper">
              <span class="badge ${priority === 'URGENT' ? 'badge-urgent' : priority === 'HIGH' ? 'badge-high' : 'badge-announcement'}">
                ${priority === 'URGENT' ? '🚨 Urgent' : priority === 'HIGH' ? '⚡ Important' : '📢 Announcement'}
              </span>
              <h1>${title}</h1>
              ${shortDescription ? `<p class="subtitle">${shortDescription}</p>` : ''}
              
              <div class="content">
                <div class="highlight-box">
                  ${body.substring(0, 500)}${body.length > 500 ? '...' : ''}
                </div>
                
                ${tags && tags.length > 0 ? `
                <div class="tags">
                  ${tags.map(tag => `<span class="tag">#${tag}</span>`).join(' ')}
                </div>
                ` : ''}
              </div>
              
              <div class="button-wrapper">
                <a href="${FRONTEND_URL}/announcements/${slug}" class="button">Read Full Announcement →</a>
              </div>
            </div>
            <div class="footer">
              <div class="footer-logo">code.scriet</div>
              <p class="footer-text">Stay informed, stay ahead! 🚀<br>The code.scriet Team</p>
              <div class="footer-links">
                <a href="${FRONTEND_URL}/announcements" class="footer-link">All Announcements</a>
                <a href="${FRONTEND_URL}/events" class="footer-link">Events</a>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `[${priority}] ${title}\n\n${shortDescription || ''}\n\n${body}\n\nRead more: ${FRONTEND_URL}/announcements/${slug}`,
  }),

  // New Event - Notify all users about new event
  newEvent: (title: string, description: string, startDate: Date, slug: string, shortDescription?: string, location?: string, imageUrl?: string, tags?: string[], eventType?: string): EmailTemplate => ({
    subject: `🎉 New Event: ${title}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${baseStyles}
      </head>
      <body>
        <div class="email-wrapper">
          <div class="container">
            <div class="header">
              <div class="logo">code<span>.scriet</span></div>
            </div>
            ${imageUrl ? `<img src="${imageUrl}" alt="${title}" class="hero-image" />` : ''}
            <div class="content-wrapper">
              <span class="badge badge-event">🎉 New Event</span>
              <h1>${title}</h1>
              ${shortDescription ? `<p class="subtitle">${shortDescription}</p>` : ''}
              
              <div class="content">
                <div class="event-details">
                  <div class="detail-row">
                    <span class="detail-icon">📅</span>
                    <div>
                      <div class="detail-label">Date</div>
                      <div class="detail-value">${startDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                    </div>
                  </div>
                  <div class="detail-row">
                    <span class="detail-icon">⏰</span>
                    <div>
                      <div class="detail-label">Time</div>
                      <div class="detail-value">${startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                  ${location ? `
                  <div class="detail-row">
                    <span class="detail-icon">📍</span>
                    <div>
                      <div class="detail-label">Location</div>
                      <div class="detail-value">${location}</div>
                    </div>
                  </div>
                  ` : ''}
                  ${eventType ? `
                  <div class="detail-row">
                    <span class="detail-icon">🏷️</span>
                    <div>
                      <div class="detail-label">Event Type</div>
                      <div class="detail-value">${eventType}</div>
                    </div>
                  </div>
                  ` : ''}
                </div>
                
                <div class="highlight-box">
                  <p>${description.substring(0, 400)}${description.length > 400 ? '...' : ''}</p>
                </div>
                
                ${tags && tags.length > 0 ? `
                <div class="tags">
                  ${tags.map(tag => `<span class="tag">#${tag}</span>`).join(' ')}
                </div>
                ` : ''}
              </div>
              
              <div class="button-wrapper">
                <a href="${FRONTEND_URL}/events/${slug}" class="button">View Event & Register →</a>
              </div>
            </div>
            <div class="footer">
              <div class="footer-logo">code.scriet</div>
              <p class="footer-text">Don't miss out! Register now 🚀<br>The code.scriet Team</p>
              <div class="footer-links">
                <a href="${FRONTEND_URL}/events" class="footer-link">All Events</a>
                <a href="${FRONTEND_URL}/announcements" class="footer-link">Announcements</a>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `New Event: ${title}\n\nDate: ${startDate.toLocaleDateString()}\nTime: ${startDate.toLocaleTimeString()}\n${location ? `Location: ${location}\n` : ''}\n${description}\n\nRegister now: ${FRONTEND_URL}/events/${slug}`,
  }),

  passwordReset: (name: string, resetLink: string): EmailTemplate => ({
    subject: 'Reset Your Password 🔐',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${baseStyles}
      </head>
      <body>
        <div class="email-wrapper">
          <div class="container">
            <div class="header">
              <div class="logo">code<span>.scriet</span></div>
            </div>
            <div class="content-wrapper">
              <span class="badge badge-reminder">🔐 Security</span>
              <h1>Reset Your Password</h1>
              
              <div class="content">
                <p>Hi <strong style="color: #fbbf24;">${name}</strong>,</p>
                <p>We received a request to reset your password. Click the button below to create a new password:</p>
              </div>
              
              <div class="button-wrapper">
                <a href="${resetLink}" class="button">Reset Password →</a>
              </div>
              
              <div class="warning-box">
                ⚠️ <strong>Important:</strong> This link expires in 1 hour. If you didn't request a password reset, please ignore this email and your password will remain unchanged.
              </div>
            </div>
            <div class="footer">
              <div class="footer-logo">code.scriet</div>
              <p class="footer-text">Keep your account secure!<br>The code.scriet Team</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Hi ${name}, click this link to reset your password: ${resetLink}. This link expires in 1 hour.`,
  }),

  eventReminder: (name: string, eventTitle: string, eventDate: Date, eventSlug: string): EmailTemplate => ({
    subject: `⏰ Reminder: ${eventTitle} is tomorrow!`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${baseStyles}
      </head>
      <body>
        <div class="email-wrapper">
          <div class="container">
            <div class="header">
              <div class="logo">code<span>.scriet</span></div>
            </div>
            <div class="content-wrapper">
              <span class="badge badge-reminder">⏰ Reminder</span>
              <h1>${eventTitle}</h1>
              <p class="subtitle">Tomorrow is the big day!</p>
              
              <div class="content">
                <p>Hi <strong style="color: #fbbf24;">${name}</strong>,</p>
                <p>Just a friendly reminder that you're registered for an exciting event tomorrow!</p>
                
                <div class="event-details">
                  <div class="detail-row">
                    <span class="detail-icon">📅</span>
                    <div>
                      <div class="detail-label">Date</div>
                      <div class="detail-value">Tomorrow, ${eventDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
                    </div>
                  </div>
                  <div class="detail-row">
                    <span class="detail-icon">⏰</span>
                    <div>
                      <div class="detail-label">Time</div>
                      <div class="detail-value" style="font-size: 24px; color: #f59e0b;">${eventDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                </div>
                
                <div class="info-box">
                  📝 <strong>Preparation Tip:</strong> Make sure you've reviewed any prerequisites mentioned in the event details. Being prepared helps you get the most out of the session!
                </div>
              </div>
              
              <div class="button-wrapper">
                <a href="${FRONTEND_URL}/events/${eventSlug}" class="button">View Event Details →</a>
              </div>
            </div>
            <div class="footer">
              <div class="footer-logo">code.scriet</div>
              <p class="footer-text">See you tomorrow! 🎉<br>The code.scriet Team</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Hi ${name}, reminder: ${eventTitle} is tomorrow at ${eventDate.toLocaleTimeString()}!`,
  }),

  // Registration Opens notification
  registrationOpens: (eventTitle: string, startDate: Date, slug: string, shortDescription?: string, imageUrl?: string): EmailTemplate => ({
    subject: `🎫 Registration Now Open: ${eventTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${baseStyles}
      </head>
      <body>
        <div class="email-wrapper">
          <div class="container">
            <div class="header">
              <div class="logo">code<span>.scriet</span></div>
            </div>
            ${imageUrl ? `<img src="${imageUrl}" alt="${eventTitle}" class="hero-image" />` : ''}
            <div class="content-wrapper">
              <span class="badge badge-event">🎫 Registration Open</span>
              <h1>${eventTitle}</h1>
              ${shortDescription ? `<p class="subtitle">${shortDescription}</p>` : ''}
              
              <div class="content">
                <p>Great news! Registration is now open for this exciting event.</p>
                
                <div class="event-details">
                  <div class="detail-row">
                    <span class="detail-icon">📅</span>
                    <div>
                      <div class="detail-label">Event Date</div>
                      <div class="detail-value">${startDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                    </div>
                  </div>
                  <div class="detail-row">
                    <span class="detail-icon">⏰</span>
                    <div>
                      <div class="detail-label">Time</div>
                      <div class="detail-value">${startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                </div>
                
                <div class="info-box">
                  🏃 <strong>Don't wait!</strong> Spots are limited and fill up fast. Secure your spot now!
                </div>
              </div>
              
              <div class="button-wrapper">
                <a href="${FRONTEND_URL}/events/${slug}" class="button">Register Now →</a>
              </div>
            </div>
            <div class="footer">
              <div class="footer-logo">code.scriet</div>
              <p class="footer-text">Don't miss out! 🚀<br>The code.scriet Team</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Registration is now open for ${eventTitle}!\n\nDate: ${startDate.toLocaleDateString()}\n\nRegister now: ${FRONTEND_URL}/events/${slug}`,
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
