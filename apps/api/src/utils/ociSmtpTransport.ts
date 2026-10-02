// OCI Email Delivery SMTP transport for bulk announcements.
//
 // Per-category routing is controlled by Settings.emailProvider<Category> (oci | brevo).
 // OCI free tier covers 3,000 emails/month; the 600-member blasts fit inside it
 // (5 full blasts/month at zero cost).
 //
 // Auth: SMTP credentials generated via the OCI CLI live in api.env as
 // OCI_SMTP_HOST / OCI_SMTP_USER / OCI_SMTP_PASS. DKIM signing is handled by OCI
 // once the domain DNS records are published (see MEMORY.md).

import nodemailer from "nodemailer";

import { logger } from "./logger.js";
import type { EmailAttachment } from "./emailTransport.js";

const OCI_SMTP_HOST = process.env.OCI_SMTP_HOST || "";
const OCI_SMTP_USER = process.env.OCI_SMTP_USER || "";
const OCI_SMTP_PASS = process.env.OCI_SMTP_PASS || "";
const OCI_BULK_FROM = process.env.OCI_BULK_FROM || "announcements@updates.codescriet.dev";
const OCI_BULK_FROM_NAME = process.env.OCI_BULK_FROM_NAME || "Code.SCRIET";
const OCI_BULK_REPLY_TO = process.env.EMAIL_REPLY_TO || "tech_admin@codescriet.dev";

// Stay comfortably under OCI sending limits: pooled connections,
// ~10 messages/second. A 600-member blast takes about a minute.
const SEND_RATE_PER_SECOND = 10;

export const isOciSmtpConfigured = (): boolean =>
  Boolean(OCI_SMTP_HOST && OCI_SMTP_USER && OCI_SMTP_PASS);

type OciTransporter = ReturnType<typeof nodemailer.createTransport>;

let transporter: OciTransporter | null = null;

function getTransporter(): OciTransporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: OCI_SMTP_HOST,
      port: 587,
      secure: false, // STARTTLS on 587
      auth: { user: OCI_SMTP_USER, pass: OCI_SMTP_PASS },
      pool: true,
      maxConnections: 5,
      maxMessages: 200,
      rateLimit: SEND_RATE_PER_SECOND,
    });
  }
  return transporter;
}

export interface OciBulkPayload {
  emails: string[];
  subject: string;
  htmlContent: string;
  textContent: string;
  unsubscribeUrlFor: (email: string) => string;
}

export interface OciSinglePayload {
  to: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  inlineImages?: Record<string, string>;
}

export async function deliverBulkViaOci(input: OciBulkPayload): Promise<boolean> {
  if (!isOciSmtpConfigured()) {
    logger.error("OCI bulk send requested but OCI_SMTP_* is not configured");
    return false;
  }
  const tx = getTransporter();
  let failed = 0;
  for (const email of input.emails) {
    try {
      await tx.sendMail({
        // One message per recipient: no reply-all leaks, better deliverability.
        from: { name: OCI_BULK_FROM_NAME, address: OCI_BULK_FROM },
        to: email,
        replyTo: OCI_BULK_REPLY_TO,
        subject: input.subject,
        html: input.htmlContent,
        text: input.textContent,
        headers: {
          // RFC 8058 one-click unsubscribe - required by Gmail/Yahoo for bulk senders.
          "List-Unsubscribe": "<" + input.unsubscribeUrlFor(email) + ">",
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
    } catch (err) {
      failed += 1;
      logger.error("OCI bulk send failed for recipient", {
        email,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const delivered = input.emails.length - failed;
  logger.info("OCI bulk send complete: " + delivered + "/" + input.emails.length + " delivered", {
    subject: input.subject,
  });
  return failed === 0;
}

export async function deliverSingleViaOci(input: OciSinglePayload): Promise<boolean> {
  if (!isOciSmtpConfigured()) {
    logger.error("OCI single send requested but OCI_SMTP_* is not configured");
    return false;
  }
  const tx = getTransporter();
  try {
    await tx.sendMail({
      from: { name: OCI_BULK_FROM_NAME, address: OCI_BULK_FROM },
      to: input.to,
      replyTo: input.replyTo || OCI_BULK_REPLY_TO,
      subject: input.subject,
      html: input.htmlContent,
      text: input.textContent,
      attachments: input.attachments?.map(a => ({ filename: a.name, content: a.content })),
      // Note: inline images (CID) not typically needed for single transactional emails via OCI
    });
    return true;
  } catch (err) {
    logger.error("OCI single send failed", {
      to: input.to,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
