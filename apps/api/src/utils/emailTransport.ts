// Brevo HTTP transport for email delivery.
//
// Holds the Brevo endpoint, the sender identity, recipient normalization,
// and the two delivery shapes used by EmailService:
//   - deliverSingle: one payload with `to` / `cc` / `bcc`
//   - deliverBatch:  one payload with messageVersions (1 message per recipient)
//
// Policy decisions (category toggle, testing-mode redirect) live in
// utils/emailPolicy.ts. Templates and Settings-driven config live in
// utils/email.ts. This module is purely the HTTP transport.

import { logger } from './logger.js';

export interface BrevoRecipient {
  email: string;
  name?: string;
}

export interface EmailAttachment {
  content: string;
  name: string;
}

export interface DeliverSinglePayload {
  to: BrevoRecipient[];
  cc?: BrevoRecipient[];
  bcc?: BrevoRecipient[];
  subject: string;
  htmlContent: string;
  textContent: string;
  attachments?: EmailAttachment[];
  inlineImages?: Record<string, string>;
}

export interface DeliverBatchPayload {
  emails: string[];
  subject: string;
  htmlContent: string;
  textContent: string;
}

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'code.scriet@codescriet.dev';
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'code.scriet';
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || 'tech_admin@codescriet.dev';

export const isTransportConfigured = (): boolean => Boolean(BREVO_API_KEY);

const EMAIL_ADDRESS_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmailAddress(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || !EMAIL_ADDRESS_REGEX.test(normalized)) {
    return null;
  }
  return normalized;
}

export function normalizeEmailList(input?: string | string[]): { valid: boolean; values: string[] } {
  if (input === undefined) {
    return { valid: true, values: [] };
  }

  const values = Array.isArray(input) ? input : [input];
  const normalized: string[] = [];

  for (const value of values) {
    if (typeof value !== 'string') {
      return { valid: false, values: [] };
    }

    const parsed = normalizeEmailAddress(value);
    if (!parsed) {
      return { valid: false, values: [] };
    }

    normalized.push(parsed);
  }

  return { valid: true, values: Array.from(new Set(normalized)) };
}

const senderIdentity = () => ({
  sender: { name: EMAIL_FROM_NAME, email: EMAIL_FROM },
  replyTo: { email: EMAIL_REPLY_TO, name: 'code.scriet Support' },
});

export async function deliverSingle(input: DeliverSinglePayload): Promise<boolean> {
  if (!isTransportConfigured()) return false;

  try {
    const payload = {
      ...senderIdentity(),
      to: input.to,
      ...(input.cc && input.cc.length > 0 ? { cc: input.cc } : {}),
      ...(input.bcc && input.bcc.length > 0 ? { bcc: input.bcc } : {}),
      subject: input.subject,
      htmlContent: input.htmlContent,
      textContent: input.textContent,
      ...(input.attachments?.length ? { attachment: input.attachments } : {}),
      ...(input.inlineImages && Object.keys(input.inlineImages).length > 0
        ? { inlineImage: input.inlineImages }
        : {}),
    };

    logger.info('📧 Brevo payload prepared', {
      to: input.to.length,
      cc: input.cc?.length ?? 0,
      bcc: input.bcc?.length ?? 0,
      hasAttachments: Boolean(input.attachments?.length),
      attachmentCount: input.attachments?.length || 0,
      hasInlineImages: Boolean(input.inlineImages && Object.keys(input.inlineImages).length > 0),
      inlineImageCount: input.inlineImages ? Object.keys(input.inlineImages).length : 0,
      subject: input.subject,
    });

    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY,
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
      recipients: input.to.length,
      ccRecipients: input.cc?.length ?? 0,
      bccRecipients: input.bcc?.length ?? 0,
      subject: input.subject,
    });
    return true;
  } catch (error) {
    logger.error('❌ Failed to send email', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

export async function deliverBatch(input: DeliverBatchPayload): Promise<boolean> {
  if (!isTransportConfigured() || input.emails.length === 0) return false;

  try {
    const messageVersions = input.emails.map((email) => ({
      to: [{ email }],
    }));

    const payload = {
      ...senderIdentity(),
      subject: input.subject,
      htmlContent: input.htmlContent,
      textContent: input.textContent,
      messageVersions,
    };

    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('❌ Brevo batch API error:', { status: response.status, body: errorText });
      throw new Error(`Brevo batch API error: ${response.status}`);
    }

    const result = await response.json();
    const messageCount = Array.isArray(result.messageIds) ? result.messageIds.length : 0;
    logger.info('📧 Batch email sent via Brevo', {
      recipients: input.emails.length,
      messageIds: messageCount,
      subject: input.subject,
    });
    return true;
  } catch (error) {
    logger.error('❌ Failed to send batch email', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}
