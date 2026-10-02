import { emailService } from './email.js';
import { sanitizeText } from './sanitize.js';

export const SLOT_MAGIC_LINK_PATH = '/hiring/slots?token=';

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

function formatSlotIST(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface SlotPickEmailParams {
  to: string;
  name: string;
  role: string;
  magicLink: string;
  deadlineIST: string;
}

export interface SlotConfirmedEmailParams {
  to: string;
  name: string;
  role: string;
  startsAt: Date | string;
  endsAt: Date | string;
  venue?: string | null;
  magicLink: string;
}

export interface SlotCancelledByAdminEmailParams {
  to: string;
  name: string;
  reason?: string;
  magicLink: string;
  deadlineIST: string;
}

export interface SlotReminderEmailParams {
  to: string;
  name: string;
  hoursLeft: 48 | 24;
  magicLink: string;
  startsAt?: Date | string;
}

export interface SlotReleasedEmailParams {
  to: string;
  name: string;
  magicLink: string;
}

// NOTE: every sender below delivers through the existing generic EmailService
// with category 'other' so something real is sent today.
// Phase 2: move to recruitment category + designed templates.
export async function sendSlotPickEmail(params: SlotPickEmailParams): Promise<boolean> {
  const name = sanitizeText(params.name);
  const role = sanitizeText(params.role);
  const subject = `Choose your interview slot — ${role}`;
  const html = `<p>Hi ${name},</p><p>You have been shortlisted for the <strong>${role}</strong> role. Please pick an interview slot before <strong>${sanitizeText(params.deadlineIST)}</strong>.</p><p><a href="${params.magicLink}">Choose your slot</a></p><p>If the button does not work, copy this link: ${params.magicLink}</p>`;
  const text = `Hi ${name}, you have been shortlisted for ${role}. Pick a slot before ${params.deadlineIST}: ${params.magicLink}`;
  // Phase 2: move to recruitment category + designed templates
  return emailService.send({ to: params.to, subject, html, text, category: 'other' });
}

export async function sendSlotConfirmedEmail(params: SlotConfirmedEmailParams): Promise<boolean> {
  const name = sanitizeText(params.name);
  const role = sanitizeText(params.role);
  const when = `${formatSlotIST(params.startsAt)} – ${formatSlotIST(params.endsAt)} IST`;
  const venue = params.venue ? sanitizeText(params.venue) : 'To be announced';
  const subject = `Interview slot confirmed — ${when}`;
  const html = `<p>Hi ${name},</p><p>Your interview for <strong>${role}</strong> is confirmed.</p><p><strong>When:</strong> ${when}</p><p><strong>Venue:</strong> ${venue}</p><p><a href="${params.magicLink}">Manage your booking</a></p>`;
  const text = `Hi ${name}, your ${role} interview is confirmed for ${when} IST at ${venue}. Manage: ${params.magicLink}`;
  // Phase 2: move to recruitment category + designed templates
  return emailService.send({ to: params.to, subject, html, text, category: 'other' });
}

export async function sendSlotCancelledByAdminEmail(
  params: SlotCancelledByAdminEmailParams,
): Promise<boolean> {
  const name = sanitizeText(params.name);
  const subject = 'Your interview booking was cancelled — please re-book';
  const reason = params.reason ? `<p><strong>Reason:</strong> ${sanitizeText(params.reason)}</p>` : '';
  const html = `<p>Hi ${name},</p><p>Your interview booking was cancelled by the hiring team.</p>${reason}<p>Please pick a new slot before <strong>${sanitizeText(params.deadlineIST)}</strong>: <a href="${params.magicLink}">Choose a new slot</a></p>`;
  const text = `Hi ${name}, your interview booking was cancelled${params.reason ? ` (reason: ${params.reason})` : ''}. Re-book before ${params.deadlineIST}: ${params.magicLink}`;
  // Phase 2: move to recruitment category + designed templates
  return emailService.send({ to: params.to, subject, html, text, category: 'other' });
}

export async function sendSlotReminderEmail(params: SlotReminderEmailParams): Promise<boolean> {
  const name = sanitizeText(params.name);
  const subject = `Reminder: pick your interview slot (${params.hoursLeft}h left)`;
  const when = params.startsAt ? ` Your booked slot is ${formatSlotIST(params.startsAt)} IST.` : '';
  const html = `<p>Hi ${name},</p><p>This is a reminder — you have <strong>${params.hoursLeft} hours</strong> left to pick your interview slot.${when}</p><p><a href="${params.magicLink}">Choose your slot</a></p>`;
  const text = `Hi ${name}, ${params.hoursLeft}h left to pick your interview slot.${when} ${params.magicLink}`;
  // Phase 2: move to recruitment category + designed templates
  return emailService.send({ to: params.to, subject, html, text, category: 'other' });
}

export async function sendSlotReleasedEmail(params: SlotReleasedEmailParams): Promise<boolean> {
  const name = sanitizeText(params.name);
  const subject = 'Your interview slot was released';
  const html = `<p>Hi ${name},</p><p>Your interview slot booking has been released. You can pick a new slot here: <a href="${params.magicLink}">Choose a slot</a></p>`;
  const text = `Hi ${name}, your interview slot was released. Pick a new one: ${params.magicLink}`;
  // Phase 2: move to recruitment category + designed templates
  return emailService.send({ to: params.to, subject, html, text, category: 'other' });
}
