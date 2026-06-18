// Email template definitions used by EmailService.
// Extracted from email.ts to keep that file focused on transport orchestration.
// Each template is a pure (or async pure for QR generation) function that returns
// { subject, html, text?, attachments?, inlineImages? } for the transport layer
// to dispatch. Renderer helpers (markdownToEmailHtml, generateEmailTemplate,
// SITE_URL, type definitions) are imported back from email.ts.
import QRCode from 'qrcode';
import { logger } from './logger.js';
import { type EmailAttachment } from './emailTransport.js';
import {
  type EmailTemplate,
  type EventRegistrationContext,
  SITE_URL,
  generateEmailTemplate,
  htmlToPlainText,
  markdownToEmailHtml,
} from './email.js';

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
  eventRegistration: async (
    name: string,
    eventTitle: string,
    eventDate: Date,
    eventSlug: string,
    location?: string,
    imageUrl?: string,
    attendanceToken?: string,
    context?: EventRegistrationContext
  ): Promise<EmailTemplate> => {
    // Generate QR code and include it both inline and as an attachment.
    // Different clients handle CID/data rendering differently; attachment is the reliable fallback.
    let qrSection = '';
    const attachments: EmailAttachment[] = [];
    const inlineImages: Record<string, string> = {};
    const teamLabel = context?.teamRole === 'LEADER'
      ? 'Team Leader'
      : context?.teamRole === 'MEMBER'
      ? 'Team Member'
      : context?.teamRole;
    const teamValue = context?.teamName
      ? `${context.teamName}${teamLabel ? ` (${teamLabel})` : ''}`
      : null;
    if (attendanceToken) {
      try {
        const qrDataUrl = await QRCode.toDataURL(attendanceToken, {
          width: 200,
          margin: 1,
          color: { dark: '#1c1917', light: '#ffffff' },
        });
        // Strip data URI prefix to get raw base64 for Brevo.
        const qrBase64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
        inlineImages['qr-ticket.png'] = qrBase64;
        attachments.push({ content: qrBase64, name: 'qr-ticket.png' });
        qrSection = `
        <div style="text-align:center; margin: 24px 0; padding: 20px; background: linear-gradient(135deg, #fef3c715, #fde68a10); border: 1px solid #f59e0b30; border-radius: 12px;">
          <p style="margin: 0 0 12px; font-size: 13px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Your QR Attendance Ticket</p>
          <div style="display:inline-block; padding: 8px; background: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <img src="cid:qr-ticket.png" alt="QR Attendance Ticket" width="160" height="160" style="display:block; border-radius:4px;" />
          </div>
          <p style="margin: 12px 0 0; font-size: 11px; color: #9ca3af;">Show this QR code at the event entrance for check-in</p>
          <p style="margin: 8px 0 0; font-size: 11px; color: #6b7280;">Can't see the QR? Check the attached file <strong>qr-ticket.png</strong> or <a href="${SITE_URL}/dashboard/events" style="color: #fbbf24; text-decoration: underline;">view your ticket in your dashboard</a>.</p>
        </div>`;
      } catch (err) {
        logger.warn('Failed to generate QR code for registration email', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // S-04 — "Add to Google Calendar" deep link. No endDate is passed to this
    // template, so fall back to start + 2h (same as the QR-window / client helper).
    const calStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const calEnd = new Date(eventDate.getTime() + 2 * 60 * 60 * 1000);
    const calParams = new URLSearchParams({
      action: 'TEMPLATE',
      text: eventTitle,
      dates: `${calStamp(eventDate)}/${calStamp(calEnd)}`,
      details: `${SITE_URL}/events/${eventSlug}`,
    });
    if (location) calParams.set('location', location);
    const googleCalendarUrl = `https://calendar.google.com/calendar/render?${calParams.toString()}`;
    const calendarSection = `
        <div style="text-align:center; margin: 20px 0 4px;">
          <a href="${googleCalendarUrl}" target="_blank" style="display:inline-block; padding: 10px 18px; font-size: 13px; font-weight: 600; color: #10b981; text-decoration: none; border: 1px solid #10b98155; border-radius: 10px;">📅 Add to Google Calendar</a>
        </div>`;

    return {
      subject: `Confirmed · ${eventTitle}`,
      attachments,
      inlineImages,
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
          ...(teamValue ? [{ icon: '👥', label: 'Team', value: teamValue }] : []),
        ],
        body: `
        <p style="margin: 0 0 16px; font-size: 15px; color: #d1d5db; line-height: 1.7;">
          Your commitment to growth sets you apart. We've reserved your seat—now it's time to show up and level up.
        </p>
        ${teamValue ? `
        <div style="padding: 16px 20px; margin-top: 14px; background: linear-gradient(135deg, #3b82f615, #06b6d410); border-left: 3px solid #38bdf8; border-radius: 0 12px 12px 0;">
          <p style="margin: 0; font-size: 14px; color: #93c5fd;">
            <strong>Team registration active:</strong> You're registered under <strong>${context?.teamName}</strong>${teamLabel ? ` as ${teamLabel}` : ''}.
          </p>
        </div>
        ` : ''}

        <div style="padding: 16px 20px; background: linear-gradient(135deg, #10b98115, #05966910); border-left: 3px solid #10b981; border-radius: 0 12px 12px 0;">
          <p style="margin: 0; font-size: 14px; color: #6ee7b7;">
            <strong>Insider tip:</strong> Arrive 10 minutes early. The best connections happen before the session starts.
          </p>
        </div>
        ${calendarSection}
        ${qrSection}
      `,
        cta: { text: 'View Event Details', url: `${SITE_URL}/events/${eventSlug}` },
        footer: 'The future belongs to those who prepare for it.',
      }),
      text: `Hi ${name}, your registration for ${eventTitle} on ${eventDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} is confirmed!${teamValue ? ` Team: ${teamValue}.` : ''}`,
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

  // New Poll notification
  newPoll: (
    question: string,
    slug: string,
    description?: string,
    deadline?: Date | null,
    allowMultipleChoices?: boolean,
    customIntro?: string,
    customFooter?: string,
  ): EmailTemplate => {
    const detailLines = [
      allowMultipleChoices ? 'Multiple options can be selected.' : 'Choose one option and submit your vote.',
      deadline
        ? `Voting closes on ${deadline.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })}.`
        : 'Voting stays open until an admin closes the poll.',
      'You can also share feedback below the poll after voting.',
    ];

    const introBlock = customIntro
      ? `<div style="margin-bottom: 16px;">${markdownToEmailHtml(customIntro)}</div>`
      : '';

    const descriptionBlock = description
      ? `<p style="margin: 0 0 18px; font-size: 15px; color: #d1d5db; line-height: 1.7;">${description}</p>`
      : '';

    const detailBlock = `
      <div style="padding: 18px 20px; background: linear-gradient(135deg, #0f766e15, #0f766e08); border: 1px solid #0f766e30; border-radius: 12px; margin: 18px 0;">
        <p style="margin: 0 0 10px; font-size: 12px; color: #14b8a6; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">How This Poll Works</p>
        <ul style="margin: 0; padding-left: 18px; color: #d1d5db;">
          ${detailLines.map((line) => `<li style="margin: 6px 0; line-height: 1.6;">${line}</li>`).join('')}
        </ul>
      </div>
    `;

    return {
      subject: `[Poll] ${question}`,
      html: generateEmailTemplate({
        preheader: description || 'A new community poll is now live on code.scriet.',
        accentColor: '#0f766e',
        badge: { text: allowMultipleChoices ? 'Multi-select Poll' : 'Community Poll', icon: '🗳️' },
        title: question,
        subtitle: description || 'Cast your vote and share your thoughts with the club.',
        infoCards: [
          {
            icon: allowMultipleChoices ? '☑️' : '🔘',
            label: 'Vote Type',
            value: allowMultipleChoices ? 'Multiple choices allowed' : 'Single choice only',
          },
          {
            icon: deadline ? '⏳' : '🕒',
            label: 'Deadline',
            value: deadline
              ? deadline.toLocaleString('en-IN', {
                  timeZone: 'Asia/Kolkata',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                })
              : 'No closing date set',
          },
        ],
        body: `${introBlock}${descriptionBlock}${detailBlock}`,
        cta: { text: 'Open Poll', url: `${SITE_URL}/polls/${slug}` },
        secondaryCta: { text: 'Go to dashboard', url: `${SITE_URL}/dashboard/announcements` },
        footer: customFooter || 'Your vote helps shape the direction of the club.',
      }),
      text: `A new poll is live on code.scriet.\n\nQuestion: ${question}\n${description ? `\n${description}\n` : ''}\nVote type: ${
        allowMultipleChoices ? 'Multiple choices allowed' : 'Single choice only'
      }\nDeadline: ${deadline ? deadline.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'No deadline set'}\n\nVote here: ${SITE_URL}/polls/${slug}`,
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

  // S-10 — post-event "thanks for coming + feedback" request.
  eventFeedback: (eventTitle: string, pollSlug: string): EmailTemplate => ({
    subject: `Thanks for coming · ${eventTitle}`,
    html: generateEmailTemplate({
      preheader: `Two quick questions about ${eventTitle}`,
      accentColor: '#10b981',
      badge: { text: 'Thanks for Coming', icon: '🙏' },
      title: `How was ${eventTitle}?`,
      subtitle: 'Two quick questions — your feedback shapes the next one.',
      body: `
        <p style="margin: 0 0 16px; font-size: 15px; color: #d1d5db; line-height: 1.7;">
          Thanks for being there. It takes under a minute, and we read every response
          when we plan what comes next.
        </p>
      `,
      cta: { text: 'Share Quick Feedback', url: `${SITE_URL}/polls/${pollSlug}` },
      footer: 'The best events are shaped by the people in the room.',
    }),
    text: `Thanks for coming to ${eventTitle}! Share quick feedback (2 questions): ${SITE_URL}/polls/${pollSlug}`,
  }),

  // S-11 — event changed / cancelled notice to registrants.
  eventUpdate: (eventTitle: string, slug: string, kind: 'updated' | 'cancelled', summary: string): EmailTemplate => {
    const cancelled = kind === 'cancelled';
    return {
      subject: cancelled ? `Cancelled · ${eventTitle}` : `Updated · ${eventTitle}`,
      html: generateEmailTemplate({
        preheader: cancelled
          ? `${eventTitle} has been cancelled.`
          : `Details have changed for ${eventTitle} — please check.`,
        accentColor: cancelled ? '#ef4444' : '#f59e0b',
        badge: { text: cancelled ? 'Event Cancelled' : 'Event Updated', icon: cancelled ? '⚠️' : '🔄' },
        title: eventTitle,
        subtitle: cancelled
          ? 'This event will no longer take place. Apologies for the inconvenience.'
          : 'Some details have changed since you registered. Here is what is new:',
        body: `
          <div style="padding: 16px 20px; background: ${cancelled ? 'linear-gradient(135deg, #ef444415, #b91c1c10)' : 'linear-gradient(135deg, #fbbf2415, #f59e0b10)'}; border-left: 3px solid ${cancelled ? '#ef4444' : '#fbbf24'}; border-radius: 0 12px 12px 0;">
            <p style="margin: 0; font-size: 15px; color: ${cancelled ? '#fca5a5' : '#fcd34d'}; line-height: 1.6;">${summary}</p>
          </div>
          ${cancelled ? '' : '<p style="margin: 16px 0 0; font-size: 14px; color: #a1a1aa;">Open the event page for the full, up-to-date details.</p>'}
        `,
        cta: cancelled
          ? { text: 'Browse Other Events', url: `${SITE_URL}/events` }
          : { text: 'View Updated Details', url: `${SITE_URL}/events/${slug}` },
        footer: cancelled ? 'Thank you for understanding.' : 'Plans change — we keep you posted.',
      }),
      text: cancelled
        ? `"${eventTitle}" has been cancelled. ${summary}`
        : `"${eventTitle}" was updated: ${summary}. Details: ${SITE_URL}/events/${slug}`,
    };
  },

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
