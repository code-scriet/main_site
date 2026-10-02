import { emailService, generateEmailTemplate } from './email.js';
import { logger } from './logger.js';
import { broadcastNotification } from './notifications.js';
import { escapeHtml, sanitizeText, sanitizeUrl } from './sanitize.js';

export const SLOT_MAGIC_LINK_PATH = '/hiring/slots?token=';

// Club name convention mirrors the hiring templates in emailTemplates.ts
// (hiringApplication / hiringSelected / hiringRejected hardcode 'code.scriet').
export const INTERVIEW_CLUB_NAME = 'code.scriet';

export function buildSlotMagicLink(rawToken: string): string {
  const base = (process.env.FRONTEND_URL || 'https://codescriet.dev').replace(/\/+$/, '');
  return `${base}${SLOT_MAGIC_LINK_PATH}${encodeURIComponent(rawToken)}`;
}

export function formatDeadlineIST(date: Date): string {
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Every rendered date carries an explicit IST marker. Deadline strings arrive
// pre-formatted (formatDeadlineIST); append the suffix unless already present.
function withIST(value: string): string {
  const trimmed = value.trim();
  return /IST$/i.test(trimmed) ? trimmed : `${trimmed} IST`;
}

// "Friday, 9 Jan" style — en-IN Asia/Kolkata, weekday long + day + month short.
function formatSlotDateIST(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

function formatSlotTimeIST(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatSlotRangeIST(startsAt: Date | string, endsAt: Date | string): string {
  return `${formatSlotDateIST(startsAt)}, ${formatSlotTimeIST(startsAt)} - ${formatSlotTimeIST(endsAt)}`;
}

// Friendly track labels — same mapping the hiring templates use.
const TRACK_LABELS: Record<string, string> = {
  TECHNICAL: 'Technical Division',
  DSA_CHAMPS: 'DSA Champs Division',
  DESIGNING: 'Design Division',
  SOCIAL_MEDIA: 'Social Media Division',
  MANAGEMENT: 'Operations & Management',
};

function trackLabel(role: string): string {
  return TRACK_LABELS[role] || role;
}

function safeMagicLink(magicLink: string): string {
  return escapeHtml(sanitizeUrl(magicLink) || magicLink);
}

export interface SlotPickEmailParams {
  to: string;
  name: string;
  role: string;
  magicLink: string;
  deadlineIST: string;
  clubName?: string;
}

export interface SlotConfirmedEmailParams {
  to: string;
  name: string;
  role: string;
  startsAt: Date | string;
  endsAt: Date | string;
  venue?: string | null;
  magicLink: string;
  clubName?: string;
}

export interface SlotCancelledByAdminEmailParams {
  to: string;
  name: string;
  reason?: string;
  magicLink: string;
  deadlineIST: string;
  clubName?: string;
}

export interface SlotReminderEmailParams {
  to: string;
  name: string;
  hoursLeft: 48 | 24;
  magicLink: string;
  startsAt?: Date | string;
  deadlineIST?: string;
  clubName?: string;
}

export interface SlotReleasedEmailParams {
  to: string;
  name: string;
  magicLink: string;
  deadlineIST?: string;
  clubName?: string;
}

export async function sendSlotPickEmail(params: SlotPickEmailParams): Promise<boolean> {
  const club = sanitizeText(params.clubName || INTERVIEW_CLUB_NAME);
  const name = sanitizeText(params.name);
  const track = sanitizeText(trackLabel(sanitizeText(params.role)));
  const deadline = withIST(sanitizeText(params.deadlineIST));
  const magicLink = safeMagicLink(params.magicLink);
  const subject = `${name}, pick your interview slot — ${club}`;
  const html = generateEmailTemplate({
    preheader: `You have been shortlisted. Pick your interview slot before ${deadline}.`,
    accentColor: '#fbbf24',
    badge: { text: 'Interview shortlist' },
    title: `Congratulations, ${escapeHtml(name)}!`,
    subtitle: `You have been shortlisted for the ${escapeHtml(track)} at ${escapeHtml(club)}.`,
    body: `
      <p style="margin: 0 0 20px; font-size: 16px; color: #e5e7eb; line-height: 1.8;">
        Your application stood out, and we would like to meet you. Use your personal link below
        to pick an interview slot before <strong style="color: #fbbf24;">${escapeHtml(deadline)}</strong>.
      </p>
      <p style="margin: 0; font-size: 15px; color: #d1d5db; line-height: 1.7;">
        Slots fill on a first-come-first-served basis, so earlier is better. This link is unique to
        you — please do not share it.
      </p>
    `,
    cta: { text: 'Pick your interview slot', url: magicLink },
    footer: `Applied track: ${escapeHtml(track)}. Questions? Reply to this email.`,
  });
  const text = [
    `Hi ${name}, congratulations! You have been shortlisted for the ${track} at ${club}.`,
    '',
    `Pick your interview slot before ${deadline}. Slots fill on a first-come-first-served basis.`,
    '',
    `Pick your slot here: ${params.magicLink}`,
  ].join('\n');
  return emailService.send({ to: params.to, subject, html, text, category: 'recruitment' });
}

export async function sendSlotConfirmedEmail(params: SlotConfirmedEmailParams): Promise<boolean> {
  const club = sanitizeText(params.clubName || INTERVIEW_CLUB_NAME);
  const name = sanitizeText(params.name);
  const track = sanitizeText(trackLabel(sanitizeText(params.role)));
  const datePart = formatSlotDateIST(params.startsAt);
  const when = withIST(formatSlotRangeIST(params.startsAt, params.endsAt));
  const venue = params.venue ? sanitizeText(params.venue) : 'To be announced';
  const magicLink = safeMagicLink(params.magicLink);
  const subject = `Interview confirmed — ${datePart}`;
  const html = generateEmailTemplate({
    preheader: `Your interview is confirmed for ${when}.`,
    accentColor: '#10b981',
    badge: { text: 'Slot confirmed' },
    title: `See you soon, ${escapeHtml(name)}!`,
    subtitle: `Your interview for the ${escapeHtml(track)} at ${escapeHtml(club)} is confirmed.`,
    body: `
      <p style="margin: 0 0 20px; font-size: 16px; color: #e5e7eb; line-height: 1.8;">
        <strong style="color: #fbbf24;">When:</strong> ${escapeHtml(when)}<br />
        <strong style="color: #fbbf24;">Venue:</strong> ${escapeHtml(venue)}
      </p>
      <p style="margin: 0; font-size: 15px; color: #d1d5db; line-height: 1.7;">
        Please arrive 5 minutes early with a valid college ID. If something comes up, use your
        personal link below to change or cancel your booking.
      </p>
    `,
    cta: { text: 'Manage your booking', url: magicLink },
    footer: `Applied track: ${escapeHtml(track)}. Questions? Reply to this email.`,
  });
  const text = [
    `Hi ${name}, your interview for the ${track} at ${club} is confirmed.`,
    '',
    `When: ${when}`,
    `Venue: ${venue}`,
    '',
    'Please arrive 5 minutes early with a valid college ID.',
    `Change or cancel your booking here: ${params.magicLink}`,
  ].join('\n');
  return emailService.send({ to: params.to, subject, html, text, category: 'recruitment' });
}

export async function sendSlotCancelledByAdminEmail(
  params: SlotCancelledByAdminEmailParams,
): Promise<boolean> {
  const club = sanitizeText(params.clubName || INTERVIEW_CLUB_NAME);
  const name = sanitizeText(params.name);
  const deadline = withIST(sanitizeText(params.deadlineIST));
  const magicLink = safeMagicLink(params.magicLink);
  const reason = params.reason ? sanitizeText(params.reason) : '';
  const subject = 'Your interview slot was cancelled — please pick a new one';
  const html = generateEmailTemplate({
    preheader: 'Your booking was cancelled. Pick a fresh slot before ' + deadline + '.',
    accentColor: '#f59e0b',
    badge: { text: 'Booking cancelled' },
    title: `Sorry about this, ${escapeHtml(name)}`,
    subtitle: `Your interview booking with ${escapeHtml(club)} was cancelled by the hiring team.`,
    body: `
      <p style="margin: 0 0 20px; font-size: 16px; color: #e5e7eb; line-height: 1.8;">
        We are sorry for the inconvenience. Your application is still active — please pick a fresh
        slot using your personal link below before <strong style="color: #fbbf24;">${escapeHtml(deadline)}</strong>.
      </p>
      ${reason ? `<p style="margin: 0; font-size: 15px; color: #d1d5db; line-height: 1.7;">Reason shared by the team: ${escapeHtml(reason)}</p>` : ''}
    `,
    cta: { text: 'Pick a new slot', url: magicLink },
    footer: `Questions? Reply to this email and the ${escapeHtml(club)} team will help.`,
  });
  const text = [
    `Hi ${name}, we are sorry — your interview booking with ${club} was cancelled by the hiring team.`,
    reason ? `Reason: ${reason}` : '',
    '',
    `Your application is still active. Please pick a fresh slot before ${deadline}: ${params.magicLink}`,
  ]
    .filter((line) => line !== '')
    .join('\n');
  return emailService.send({ to: params.to, subject, html, text, category: 'recruitment' });
}

export async function sendSlotReminderEmail(params: SlotReminderEmailParams): Promise<boolean> {
  const club = sanitizeText(params.clubName || INTERVIEW_CLUB_NAME);
  const name = sanitizeText(params.name);
  const magicLink = safeMagicLink(params.magicLink);
  const windowLabel = `${params.hoursLeft} hours left`;
  const deadlineLine = params.deadlineIST
    ? ` Your pick window closes ${withIST(sanitizeText(params.deadlineIST))}.`
    : '';
  const bookedLine = params.startsAt
    ? ` Your booked slot is ${withIST(formatSlotRangeIST(params.startsAt, params.startsAt))}.`
    : '';
  const subject = `Reminder: ${windowLabel} to pick your interview slot`;
  const html = generateEmailTemplate({
    preheader: `${windowLabel} to pick your interview slot at ${club}.`,
    accentColor: '#f59e0b',
    badge: { text: windowLabel },
    title: `Hi ${escapeHtml(name)}, ${escapeHtml(windowLabel)}`,
    subtitle: `Your interview invitation from ${escapeHtml(club)} is still waiting.`,
    body: `
      <p style="margin: 0 0 20px; font-size: 16px; color: #e5e7eb; line-height: 1.8;">
        This is a friendly reminder — you have <strong style="color: #fbbf24;">${params.hoursLeft} hours left</strong>
        to pick your interview slot.${escapeHtml(deadlineLine)}${escapeHtml(bookedLine)}
      </p>
      <p style="margin: 0; font-size: 15px; color: #d1d5db; line-height: 1.7;">
        Slots fill on a first-come-first-served basis. Use your personal link below before time runs out.
      </p>
    `,
    cta: { text: 'Pick your slot now', url: magicLink },
    footer: `Questions? Reply to this email and the ${escapeHtml(club)} team will help.`,
  });
  const text = `Hi ${name}, you have ${windowLabel} to pick your interview slot at ${club}.${deadlineLine}${bookedLine} Pick here: ${params.magicLink}`;
  return emailService.send({ to: params.to, subject, html, text, category: 'recruitment' });
}

export async function sendSlotReleasedEmail(params: SlotReleasedEmailParams): Promise<boolean> {
  const club = sanitizeText(params.clubName || INTERVIEW_CLUB_NAME);
  const name = sanitizeText(params.name);
  const magicLink = safeMagicLink(params.magicLink);
  const deadlineLine = params.deadlineIST
    ? ` Please pick a new one before <strong style="color: #fbbf24;">${escapeHtml(withIST(sanitizeText(params.deadlineIST)))}</strong>.`
    : ' Please pick a new one using your personal link below.';
  const subject = 'Your interview slot booking was released';
  const html = generateEmailTemplate({
    preheader: `Your interview slot booking was released. Pick a new slot at ${club}.`,
    accentColor: '#f59e0b',
    badge: { text: 'Booking released' },
    title: `Hi ${escapeHtml(name)}`,
    subtitle: `Your interview slot booking with ${escapeHtml(club)} has been released.`,
    body: `
      <p style="margin: 0; font-size: 16px; color: #e5e7eb; line-height: 1.8;">
        This is to confirm your previous booking is no longer held. Your application is still active.${deadlineLine}
      </p>
    `,
    cta: { text: 'Pick a new slot', url: magicLink },
    footer: `Questions? Reply to this email and the ${escapeHtml(club)} team will help.`,
  });
  const text = [
    `Hi ${name}, your interview slot booking with ${club} has been released.`,
    '',
    params.deadlineIST
      ? `Please pick a new one before ${withIST(params.deadlineIST)}: ${params.magicLink}`
      : `Pick a new one here: ${params.magicLink}`,
  ].join('\n');
  return emailService.send({ to: params.to, subject, html, text, category: 'recruitment' });
}

// In-app bell for PENDING → INTERVIEW_SCHEDULED. Fire-and-forget: persistence
// failures are logged inside broadcastNotification (returns null) and the extra
// catch below guards the socket ping — the request must never break.
export function notifyInterviewScheduledBell(params: {
  userId: string | null | undefined;
  deadlineIST: string;
  applicationId: string;
}): void {
  const userId = params.userId;
  if (!userId) return;
  const deadline = sanitizeText(params.deadlineIST);
  void broadcastNotification({
    source: 'SYSTEM',
    audience: 'CUSTOM',
    audienceUserIds: [userId],
    category: 'hiring',
    icon: 'calendar',
    title: 'Interview scheduled',
    body: `Pick your interview slot by ${deadline}`,
    link: '/dashboard/hiring',
    refEntity: 'hiring-application',
    refEntityId: params.applicationId,
  }).catch((err) => {
    logger.error('Interview scheduled bell notification failed', {
      applicationId: params.applicationId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}
