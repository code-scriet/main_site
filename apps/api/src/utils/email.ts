// Email service for notifications
// This is a skeleton that can be configured with any email provider (SendGrid, Mailgun, etc.)

import { logger } from './logger.js';

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

// Email templates
export const EmailTemplates = {
  welcome: (name: string, clubName: string): EmailTemplate => ({
    subject: `Welcome to ${clubName}! 🎉`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 32px; font-weight: bold; color: #d97706; }
          h1 { color: #1f2937; margin: 0; }
          .content { color: #4b5563; line-height: 1.6; }
          .button { display: inline-block; background: linear-gradient(to right, #f59e0b, #ea580c); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">code.scriet</div>
          </div>
          <h1>Welcome, ${name}! 👋</h1>
          <div class="content">
            <p>We're thrilled to have you join <strong>${clubName}</strong>!</p>
            <p>You're now part of a community of passionate coders dedicated to learning, building, and growing together.</p>
            <p>Here's what you can do:</p>
            <ul>
              <li>🎯 Solve the Question of the Day (QOTD)</li>
              <li>📅 Register for upcoming events and workshops</li>
              <li>🏆 Track your progress on the leaderboard</li>
              <li>📢 Stay updated with announcements</li>
            </ul>
            <a href="${process.env.FRONTEND_URL}" class="button">Explore Dashboard</a>
          </div>
          <div class="footer">
            <p>Happy coding! 🚀</p>
            <p>${clubName}</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Welcome to ${clubName}, ${name}! We're thrilled to have you join us. Visit ${process.env.FRONTEND_URL} to get started.`,
  }),

  eventRegistration: (name: string, eventTitle: string, eventDate: Date, location?: string): EmailTemplate => ({
    subject: `You're registered for ${eventTitle}! ✅`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 32px; font-weight: bold; color: #d97706; }
          h1 { color: #1f2937; margin: 0; font-size: 24px; }
          .event-card { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 12px; padding: 20px; margin: 20px 0; }
          .event-title { font-size: 20px; font-weight: bold; color: #92400e; margin-bottom: 10px; }
          .event-detail { display: flex; align-items: center; color: #78716c; margin: 8px 0; }
          .content { color: #4b5563; line-height: 1.6; }
          .button { display: inline-block; background: linear-gradient(to right, #f59e0b, #ea580c); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">code.scriet</div>
          </div>
          <h1>Registration Confirmed! ✅</h1>
          <div class="content">
            <p>Hi ${name},</p>
            <p>You're all set! You've successfully registered for:</p>
            <div class="event-card">
              <div class="event-title">${eventTitle}</div>
              <div class="event-detail">📅 ${eventDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
              <div class="event-detail">⏰ ${eventDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
              ${location ? `<div class="event-detail">📍 ${location}</div>` : ''}
            </div>
            <p>We're excited to see you there!</p>
            <a href="${process.env.FRONTEND_URL}/dashboard/events" class="button">View My Events</a>
          </div>
          <div class="footer">
            <p>See you soon! 🎉</p>
            <p>code.scriet</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Hi ${name}, you're registered for ${eventTitle} on ${eventDate.toLocaleDateString()}. See you there!`,
  }),

  newAnnouncement: (title: string, body: string, priority: string): EmailTemplate => ({
    subject: `${priority === 'URGENT' ? '🚨 URGENT: ' : ''}New Announcement: ${title}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 32px; font-weight: bold; color: #d97706; }
          .priority-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 10px; }
          .priority-URGENT { background: #fef2f2; color: #dc2626; }
          .priority-HIGH { background: #fff7ed; color: #ea580c; }
          .priority-MEDIUM { background: #eff6ff; color: #2563eb; }
          .priority-LOW { background: #f3f4f6; color: #6b7280; }
          h1 { color: #1f2937; margin: 0; font-size: 24px; }
          .content { color: #4b5563; line-height: 1.6; margin-top: 20px; }
          .button { display: inline-block; background: linear-gradient(to right, #f59e0b, #ea580c); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">code.scriet</div>
          </div>
          <span class="priority-badge priority-${priority}">${priority}</span>
          <h1>${title}</h1>
          <div class="content">
            <p>${body}</p>
          </div>
          <a href="${process.env.FRONTEND_URL}/announcements" class="button">View Announcement</a>
          <div class="footer">
            <p>code.scriet</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `[${priority}] ${title}\n\n${body}\n\nView at: ${process.env.FRONTEND_URL}/announcements`,
  }),

  passwordReset: (name: string, resetLink: string): EmailTemplate => ({
    subject: 'Reset Your Password 🔐',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 32px; font-weight: bold; color: #d97706; }
          h1 { color: #1f2937; margin: 0; }
          .content { color: #4b5563; line-height: 1.6; }
          .button { display: inline-block; background: linear-gradient(to right, #f59e0b, #ea580c); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
          .warning { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 12px; margin: 20px 0; color: #92400e; font-size: 14px; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">code.scriet</div>
          </div>
          <h1>Reset Your Password</h1>
          <div class="content">
            <p>Hi ${name},</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <a href="${resetLink}" class="button">Reset Password</a>
            <div class="warning">
              ⚠️ This link expires in 1 hour. If you didn't request a password reset, please ignore this email.
            </div>
          </div>
          <div class="footer">
            <p>code.scriet</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Hi ${name}, click this link to reset your password: ${resetLink}. This link expires in 1 hour.`,
  }),

  eventReminder: (name: string, eventTitle: string, eventDate: Date): EmailTemplate => ({
    subject: `Reminder: ${eventTitle} is tomorrow! ⏰`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 32px; font-weight: bold; color: #d97706; }
          .reminder-badge { display: inline-block; background: #dcfce7; color: #16a34a; padding: 6px 16px; border-radius: 20px; font-weight: 600; margin-bottom: 20px; }
          h1 { color: #1f2937; margin: 0; font-size: 24px; }
          .content { color: #4b5563; line-height: 1.6; }
          .event-time { font-size: 28px; font-weight: bold; color: #d97706; margin: 20px 0; text-align: center; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">code.scriet</div>
          </div>
          <span class="reminder-badge">📅 Tomorrow!</span>
          <h1>${eventTitle}</h1>
          <div class="content">
            <p>Hi ${name},</p>
            <p>Just a friendly reminder that you're registered for an event tomorrow!</p>
            <div class="event-time">
              ${eventDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <p>Don't forget to prepare anything mentioned in the event requirements. We're looking forward to seeing you!</p>
          </div>
          <div class="footer">
            <p>See you tomorrow! 🎉</p>
            <p>code.scriet</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Hi ${name}, reminder: ${eventTitle} is tomorrow at ${eventDate.toLocaleTimeString()}!`,
  }),
};

class EmailService {
  private configured: boolean = false;

  constructor() {
    // Check if email provider is configured
    // This could be SendGrid, Mailgun, AWS SES, etc.
    this.configured = !!(process.env.EMAIL_API_KEY && process.env.EMAIL_FROM);
  }

  async send(options: EmailOptions): Promise<boolean> {
    if (!this.configured) {
      logger.debug('Email service not configured, skipping email', { 
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject 
      });
      return false;
    }

    try {
      // Here you would integrate with your email provider
      // Example with SendGrid:
      // const sgMail = require('@sendgrid/mail');
      // sgMail.setApiKey(process.env.EMAIL_API_KEY);
      // await sgMail.send({
      //   to: options.to,
      //   from: process.env.EMAIL_FROM,
      //   subject: options.subject,
      //   html: options.html,
      //   text: options.text,
      // });

      logger.info('Email sent successfully', {
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
      });
      return true;
    } catch (error) {
      logger.error('Failed to send email', {
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  async sendWelcome(email: string, name: string, clubName: string = 'code.scriet') {
    const template = EmailTemplates.welcome(name, clubName);
    return this.send({ to: email, ...template });
  }

  async sendEventRegistration(email: string, name: string, eventTitle: string, eventDate: Date, location?: string) {
    const template = EmailTemplates.eventRegistration(name, eventTitle, eventDate, location);
    return this.send({ to: email, ...template });
  }

  async sendAnnouncement(emails: string[], title: string, body: string, priority: string) {
    const template = EmailTemplates.newAnnouncement(title, body, priority);
    return this.send({ to: emails, ...template });
  }

  async sendPasswordReset(email: string, name: string, resetLink: string) {
    const template = EmailTemplates.passwordReset(name, resetLink);
    return this.send({ to: email, ...template });
  }

  async sendEventReminder(email: string, name: string, eventTitle: string, eventDate: Date) {
    const template = EmailTemplates.eventReminder(name, eventTitle, eventDate);
    return this.send({ to: email, ...template });
  }
}

export const emailService = new EmailService();
