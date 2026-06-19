// Certificate issuance — the deep module that owns "produce a certificate PDF and
// persist it." Lifted out of routes/certificates.ts so the route is a thin HTTP
// adapter and this logic is unit-testable without Express.
//
// The single render+upload seam (renderAndUploadCertificatePdf) is the one place a
// CertData payload is assembled, sanitized, rendered, and uploaded. Before this it
// was hand-written at three call sites (new issuance, cloud-asset recovery,
// edit-regenerate) that had drifted apart (inconsistent sanitization, and the team
// name silently omitted on regeneration — see CertRenderSource.teamName).
//
// Caller responsibilities (kept in the route): request validation, signatory
// resolution timing (resolve once per bulk batch), duplicate / event / recipient
// pre-checks, and post-write side effects (email, audit log, socket notification).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CertType, CertTemplate, CertEmailTemplate, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import { generateCertId } from '../utils/generateCertId.js';
import { generateCertificatePDF, type CertData } from '../utils/generateCertificatePDF.js';
import { uploadCertificate } from '../utils/uploadCertificate.js';
import { sanitizeText } from '../utils/sanitize.js';
import { isCloudinaryConfigured } from '../config/cloudinary.js';
import {
  createCertificateWithSchemaFallback,
  isCertificateIdCollisionError,
  readCertificateTeamName,
} from './certificatePersistence.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGOS_DIR = path.join(__dirname, '..', '..', 'public', 'logos');

// Pre-load logos as base64 at startup so they're available to PDF generation.
// Fails gracefully (undefined) if the files are not yet present on this server instance.
function loadLogoBase64(filename: string): string | undefined {
  const logoPath = path.join(LOGOS_DIR, filename);
  try {
    if (fs.existsSync(logoPath)) {
      const ext = path.extname(filename).replace('.', '');
      const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
      const b64 = fs.readFileSync(logoPath).toString('base64');
      return `data:${mime};base64,${b64}`;
    }
  } catch { /* file missing or unreadable — skip */ }
  return undefined;
}

const CODESCRIET_LOGO = loadLogoBase64('codescriet.png') ?? loadLogoBase64('codescriet.jpg') ?? loadLogoBase64('codescriet.jpeg');
const CCSU_LOGO       = loadLogoBase64('ccsu.png') ?? loadLogoBase64('ccsu.jpg') ?? loadLogoBase64('ccsu.jpeg');

// ──────────────────────────────────────────────────────────────────
// Render + upload seam — the single CertData assembly path.
// ──────────────────────────────────────────────────────────────────

export interface CertRenderSource {
  certId: string;
  recipientName: string;
  eventName: string;
  type: CertType;
  position?: string | null;
  domain?: string | null;
  /**
   * Team name printed on WINNER team certificates. Only available at first
   * issuance — the Certificate row has NO team_name column, so regeneration
   * (recover / edit) cannot restore it and passes undefined. Known gap; persist
   * a team_name column to close it. Threading it explicitly here keeps the gap
   * visible instead of hidden in a hand-written mapping.
   */
  teamName?: string | null;
  description?: string | null;
  issuedAt: Date;
  signatoryName: string;
  signatoryTitle: string;
  /**
   * The image actually rendered into the PDF: the processed data-URI at issuance,
   * or the stored Cloudinary URL on regeneration.
   */
  signatoryImageUrl?: string | null;
  facultyName?: string | null;
  facultyTitle?: string | null;
  facultySignatoryImageUrl?: string | null;
}

const cleanOptional = (value: string | null | undefined): string | undefined =>
  value ? sanitizeText(value) : undefined;

/**
 * Assemble the CertData payload from a render source. Owns sanitization (every
 * text field is run through sanitizeText, which is idempotent — safe even when a
 * caller pre-sanitized) and attaches the club + university logos. Pure and
 * independently testable: this is the mapping that used to be triplicated.
 */
export function buildCertData(source: CertRenderSource): CertData {
  return {
    recipientName: sanitizeText(source.recipientName),
    eventName: sanitizeText(source.eventName),
    type: source.type,
    position: cleanOptional(source.position),
    domain: cleanOptional(source.domain),
    teamName: cleanOptional(source.teamName),
    description: cleanOptional(source.description),
    certId: source.certId,
    issuedAt: source.issuedAt,
    signatoryName: sanitizeText(source.signatoryName),
    signatoryTitle: sanitizeText(source.signatoryTitle),
    signatoryImageUrl: source.signatoryImageUrl || undefined,
    facultyName: cleanOptional(source.facultyName),
    facultyTitle: cleanOptional(source.facultyTitle),
    facultySignatoryImageUrl: source.facultySignatoryImageUrl || undefined,
    codescrietLogoUrl: CODESCRIET_LOGO,
    ccsuLogoUrl: CCSU_LOGO,
  };
}

/** Render the certificate PDF and upload it to Cloudinary. Returns the pdfUrl. */
export async function renderAndUploadCertificatePdf(
  source: CertRenderSource,
  opts: { overwrite?: boolean } = {},
): Promise<string> {
  const pdfBuffer = await generateCertificatePDF(buildCertData(source));
  return uploadCertificate(source.certId, pdfBuffer, opts);
}

// ──────────────────────────────────────────────────────────────────
// Signatory resolution.
// ──────────────────────────────────────────────────────────────────

export interface ResolvedSignatory {
  id: string | null;
  name: string;
  title: string;
  processedImageUrl: string | undefined;  // base64 data URI after processing, or undefined
  rawImageUrl: string | null;             // original URL to store in certificate record
}

/**
 * Resolve signatory data from either a Signatory ID, an inline base64 image, or plain text.
 *
 * Priority order:
 *   1. signatoryId       → fetch DB record, process its stored signatureUrl
 *   2. inlineImageUrl    → Cloudinary URL uploaded by admin for custom signatory
 *   3. text only         → name/title rendered as GreatVibes cursive text (no image)
 */
export async function resolveSignatory(
  signatoryId: string | null | undefined,
  fallbackName: string | null | undefined,
  fallbackTitle: string | null | undefined,
  defaultName: string,
  defaultTitle: string,
  inlineImageUrl?: string | null,
): Promise<ResolvedSignatory> {
  // 1. Signatory ID — fetch from DB and process stored image
  if (signatoryId) {
    const signatory = await prisma.signatory.findUnique({
      where: { id: signatoryId },
      select: { id: true, name: true, title: true, signatureUrl: true },
    });

    if (signatory) {
      return {
        id: signatory.id,
        name: sanitizeText(signatory.name),
        title: sanitizeText(signatory.title),
        processedImageUrl: signatory.signatureUrl || undefined,
        rawImageUrl: signatory.signatureUrl,
      };
    }

    logger.warn('Signatory ID not found — falling back to text/image fields', { signatoryId });
  }

  // 2. Inline Cloudinary URL (custom signatory — image uploaded just for this certificate batch)
  if (inlineImageUrl?.trim()) {
    return {
      id: null,
      name: sanitizeText(fallbackName?.trim() || defaultName),
      title: sanitizeText(fallbackTitle?.trim() || defaultTitle),
      processedImageUrl: inlineImageUrl.trim(),
      rawImageUrl: inlineImageUrl.trim(),
    };
  }

  // 3. Text-only fallback
  return {
    id: null,
    name: sanitizeText(fallbackName?.trim() || defaultName),
    title: sanitizeText(fallbackTitle?.trim() || defaultTitle),
    processedImageUrl: undefined,
    rawImageUrl: null,
  };
}

// ──────────────────────────────────────────────────────────────────
// Issuance orchestrator — generateCertId → render+upload → DB write
// with schema fallback → certId-collision retry. The single source of
// truth for new certificate generation (POST /generate and POST /bulk).
// ──────────────────────────────────────────────────────────────────

export interface IssueCertificateParams {
  recipientName: string;            // pre-sanitized
  recipientEmail: string;
  recipientId: string | null;
  eventId: string | null;
  eventName: string;                // pre-sanitized
  type: CertType;
  position: string | null | undefined;
  domain: string | null | undefined;
  teamName: string | null | undefined;
  description: string | null | undefined;
  template: CertTemplate;
  primarySig: ResolvedSignatory;
  facultySig: ResolvedSignatory | null;
  issuedBy: string;
  emailTemplate?: CertEmailTemplate;
  emailSignerName?: string | null;
}

export interface IssueCertificateResult {
  certId: string;
  pdfUrl: string;
}

export class CertificateIssuanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CertificateIssuanceError';
  }
}

const MAX_CERT_ID_CREATE_RETRIES = 3;

export async function issueOneCertificate(params: IssueCertificateParams): Promise<IssueCertificateResult> {
  for (let attempt = 1; attempt <= MAX_CERT_ID_CREATE_RETRIES; attempt++) {
    const certId = generateCertId();

    // Render with the PROCESSED signatory image; the DB row below stores the RAW url.
    const pdfUrl = await renderAndUploadCertificatePdf({
      certId,
      recipientName: params.recipientName,
      eventName: params.eventName,
      type: params.type,
      position: params.position,
      domain: params.domain,
      teamName: params.teamName,
      description: params.description,
      issuedAt: new Date(),
      signatoryName: params.primarySig.name,
      signatoryTitle: params.primarySig.title,
      signatoryImageUrl: params.primarySig.processedImageUrl,
      facultyName: params.facultySig?.name,
      facultyTitle: params.facultySig?.title,
      facultySignatoryImageUrl: params.facultySig?.processedImageUrl,
    });

    const legacyCertificateData: Prisma.CertificateUncheckedCreateInput = {
      certId,
      recipientName: params.recipientName,
      recipientEmail: params.recipientEmail,
      recipientId: params.recipientId,
      eventId: params.eventId,
      eventName: params.eventName,
      type: params.type,
      position: params.position ?? null,
      domain: params.domain ?? null,
      template: params.template,
      pdfUrl,
      issuedBy: params.issuedBy,
    };

    try {
      await createCertificateWithSchemaFallback(
        certId,
        {
          ...legacyCertificateData,
          description: params.description ?? null,
          // team_name lives only in the full payload; the legacy fallback omits it
          // so an un-migrated DB (no team_name column) still creates the row.
          teamName: params.teamName ?? null,
          signatoryId: params.primarySig.id,
          signatoryName: params.primarySig.name,
          signatoryTitle: params.primarySig.title,
          signatoryImageUrl: params.primarySig.rawImageUrl,
          facultySignatoryId: params.facultySig?.id || null,
          facultyName: params.facultySig?.name || null,
          facultyTitle: params.facultySig?.title || null,
          facultySignatoryImageUrl: params.facultySig?.rawImageUrl || null,
          emailTemplate: params.emailTemplate ?? 'default',
          emailSignerName: params.emailSignerName ?? null,
        },
        legacyCertificateData,
      );
      return { certId, pdfUrl };
    } catch (createError) {
      if (isCertificateIdCollisionError(createError) && attempt < MAX_CERT_ID_CREATE_RETRIES) {
        logger.warn('Certificate ID collision detected during create; retrying', {
          certId,
          attempt,
          recipientEmail: params.recipientEmail,
        });
        continue;
      }
      throw createError;
    }
  }

  throw new CertificateIssuanceError('Failed to generate unique certificate ID');
}

// ──────────────────────────────────────────────────────────────────
// Cloud-asset recovery — regenerate the PDF for an existing certificate
// whose Cloudinary asset went missing, re-upload, and re-point pdfUrl.
// (teamName cannot be restored — it isn't persisted; see CertRenderSource.)
// ──────────────────────────────────────────────────────────────────
export async function recoverMissingCertificateCloudAsset(certId: string): Promise<string | null> {
  if (!isCloudinaryConfigured) {
    return null;
  }

  try {
    const certificate = await prisma.certificate.findUnique({
      where: { certId },
      select: {
        certId: true,
        recipientName: true,
        eventName: true,
        type: true,
        position: true,
        domain: true,
        description: true,
        issuedAt: true,
        signatoryName: true,
        signatoryTitle: true,
        signatoryImageUrl: true,
        facultyName: true,
        facultyTitle: true,
        facultySignatoryImageUrl: true,
      },
    });

    if (!certificate) {
      return null;
    }

    // Read separately + tolerantly so the main select above never breaks on an
    // instance where the team_name column hasn't been migrated yet.
    const teamName = await readCertificateTeamName(certificate.certId);

    const cloudUrl = await renderAndUploadCertificatePdf({
      certId: certificate.certId,
      recipientName: certificate.recipientName,
      eventName: certificate.eventName,
      type: certificate.type,
      position: certificate.position,
      domain: certificate.domain,
      teamName,
      description: certificate.description,
      issuedAt: certificate.issuedAt,
      signatoryName: certificate.signatoryName ?? '',
      signatoryTitle: certificate.signatoryTitle ?? '',
      signatoryImageUrl: certificate.signatoryImageUrl,
      facultyName: certificate.facultyName,
      facultyTitle: certificate.facultyTitle,
      facultySignatoryImageUrl: certificate.facultySignatoryImageUrl,
    });

    await prisma.certificate.update({
      where: { certId: certificate.certId },
      data: { pdfUrl: cloudUrl },
    });

    logger.info('Recovered missing certificate cloud asset by regeneration', { certId: certificate.certId });
    return cloudUrl;
  } catch (error) {
    logger.error('Failed to recover missing certificate cloud asset', {
      certId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
