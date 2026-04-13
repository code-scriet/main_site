import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CertType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ApiResponse, ErrorCodes } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { generateCertId } from '../utils/generateCertId.js';
import { generateCertificatePDF } from '../utils/generateCertificatePDF.js';
import { uploadCertificate } from '../utils/uploadCertificate.js';
import { emailService } from '../utils/email.js';
import { sanitizeText } from '../utils/sanitize.js';
import { auditLog } from '../utils/audit.js';
import { buildPublicCertificateDownloadUrl } from '../utils/publicUrl.js';
import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary.js';

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://codescriet.dev').replace(/\/+$/, '');
const RESEND_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

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

export const certificatesRouter = Router();

const certificateVerifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { valid: false, reason: 'rate_limited' },
});

const certificateDownloadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many download attempts, please try again later.' },
});

const certTypes = ['PARTICIPATION', 'COMPLETION', 'WINNER', 'SPEAKER'] as const;
const certTemplates = ['gold', 'dark', 'white', 'emerald'] as const;
const certificateSources = ['attendance', 'competition', 'generic'] as const;
const competitionGenerationStrategies = ['specific_round', 'best_selected_rounds', 'average_selected_rounds'] as const;

const generateSchema = z.object({
  recipientName: z.string().min(2).max(100),
  recipientEmail: z.string().email().transform(v => v.trim().toLowerCase()),
  recipientId: z.string().optional().nullable(),
  eventId: z.string().optional().nullable(),
  eventName: z.string().min(2).max(200),
  type: z.enum(certTypes),
  position: z.string().max(100).optional().nullable(),
  domain: z.string().max(100).optional().nullable(),
  description: z.string().max(400).optional().nullable(),
  template: z.enum(certTemplates).default('gold'),
  signatoryId: z.string().optional().nullable(),           // FK → Signatory (preferred)
  signatoryName: z.string().max(100).optional().nullable(),
  signatoryTitle: z.string().max(100).optional().nullable(),
  signatoryCustomImageUrl: z.string().url().optional().nullable(), // Cloudinary URL for custom signatories
  facultySignatoryId: z.string().optional().nullable(),
  facultyName: z.string().max(100).optional().nullable(),
  facultyTitle: z.string().max(100).optional().nullable(),
  facultyCustomImageUrl: z.string().url().optional().nullable(),   // Cloudinary URL for custom faculty
  sendEmail: z.boolean().default(false),
});

const bulkRecipientSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().transform(v => v.trim().toLowerCase()),
  userId: z.string().optional().nullable(),
  type: z.enum(certTypes).optional().nullable(),
  position: z.string().max(100).optional().nullable(),
  description: z.string().max(400).optional().nullable(),
  template: z.enum(certTemplates).optional().nullable(),
  domain: z.string().max(100).optional().nullable(),
  teamName: z.string().max(100).optional().nullable(),
});

const bulkSchema = z.object({
  recipients: z.array(bulkRecipientSchema).min(1).max(200),
  eventId: z.string().optional().nullable(),
  eventName: z.string().min(2).max(200),
  type: z.enum(certTypes).optional().nullable(),
  template: z.enum(certTemplates).default('gold'),
  signatoryId: z.string().optional().nullable(),
  signatoryName: z.string().max(100).optional().nullable(),
  signatoryTitle: z.string().max(100).optional().nullable(),
  signatoryCustomImageUrl: z.string().url().optional().nullable(),
  facultySignatoryId: z.string().optional().nullable(),
  facultyName: z.string().max(100).optional().nullable(),
  facultyTitle: z.string().max(100).optional().nullable(),
  facultyCustomImageUrl: z.string().url().optional().nullable(),
  description: z.string().max(400).optional().nullable(),
  domain: z.string().max(100).optional().nullable(),
  source: z.enum(certificateSources).optional().default('generic'),
  generationStrategy: z.enum(competitionGenerationStrategies).optional().nullable(),
  selectedRoundIds: z.array(z.string()).max(50).optional(),
  sendEmail: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if (!value.type && value.recipients.some((recipient) => !recipient.type)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A certificate type is required either at the batch level or for each recipient',
      path: ['type'],
    });
  }
});

const revokeSchema = z.object({
  reason: z.string().max(500).optional(),
});

const isSchemaDriftError = (error: unknown): error is Prisma.PrismaClientKnownRequestError => (
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022'
);

type CertificateFileRecord = {
  certId: string;
  pdfUrl: string | null;
  isRevoked: boolean;
  recipientId: string | null;
  recipientEmail: string;
};

type CertificateSource = (typeof certificateSources)[number];
type BulkValidationData = z.infer<typeof bulkSchema>;
type BulkRecipientInput = BulkValidationData['recipients'][number];

type ResolvedBulkRecipient = {
  name: string;
  email: string;
  normalizedEmail: string;
  userId: string | null;
  type: CertType;
  template: (typeof certTemplates)[number];
  position: string | null;
  domain: string | null;
  description: string | null;
  teamName: string | null;
};

function normalizeEmail(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function sanitizeOptionalText(value?: string | null): string | null {
  const sanitized = sanitizeText(value).trim();
  return sanitized || null;
}

function buildRecipientDuplicateKey(
  source: CertificateSource,
  recipientEmail: string,
  type: CertType,
  position?: string | null,
  description?: string | null,
): string {
  const normalizedEmail = normalizeEmail(recipientEmail) ?? recipientEmail.trim().toLowerCase();

  if (source === 'competition') {
    return [
      normalizedEmail,
      type,
      (position || '').trim().toLowerCase(),
      (description || '').trim().toLowerCase(),
    ].join('::');
  }

  return [normalizedEmail, type].join('::');
}

function resolveBulkRecipient(
  recipient: BulkRecipientInput,
  defaults: Pick<BulkValidationData, 'type' | 'template' | 'description' | 'domain'>,
): ResolvedBulkRecipient {
  const resolvedType = (recipient.type || defaults.type) as CertType;

  return {
    name: sanitizeText(recipient.name),
    email: recipient.email,
    normalizedEmail: normalizeEmail(recipient.email) ?? recipient.email,
    userId: recipient.userId || null,
    type: resolvedType,
    template: recipient.template || defaults.template,
    position: sanitizeOptionalText(recipient.position),
    domain: sanitizeOptionalText(recipient.domain ?? defaults.domain),
    description: sanitizeOptionalText(recipient.description ?? defaults.description),
    teamName: sanitizeOptionalText(recipient.teamName),
  };
}

function buildCertificateVerifyUrl(certId: string): string {
  return `${FRONTEND_URL}/verify/${certId}`;
}

function extractCertIdFromFilename(filename: string): string | null {
  const match = filename.match(/^([A-Z0-9-]{10,20})\.pdf$/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function isCertificateOwner(
  cert: Pick<CertificateFileRecord, 'recipientId' | 'recipientEmail'>,
  authUser: { id: string; email?: string | null },
): boolean {
  if (cert.recipientId && cert.recipientId === authUser.id) {
    return true;
  }

  const recipientEmail = normalizeEmail(cert.recipientEmail);
  const authEmail = normalizeEmail(authUser.email);
  return Boolean(recipientEmail && authEmail && recipientEmail === authEmail);
}

function isLegacyLocalCertificateUrl(certId: string, pdfUrl: string): boolean {
  try {
    const parsed = new URL(pdfUrl);
    const normalizedPath = parsed.pathname.replace(/\/+$/, '');
    return (
      normalizedPath.endsWith(`/certificates/files/${certId}.pdf`) ||
      normalizedPath.endsWith(`/api/certificates/files/${certId}.pdf`)
    );
  } catch {
    return false;
  }
}

function isCloudinaryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    return hostname.endsWith('res.cloudinary.com') || hostname.endsWith('api.cloudinary.com');
  } catch {
    return false;
  }
}

function extractCloudinaryPublicIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.toLowerCase().endsWith('cloudinary.com')) {
      return null;
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    const uploadIndex = segments.findIndex((segment) => ['upload', 'private', 'authenticated'].includes(segment));
    if (uploadIndex === -1) {
      return null;
    }

    let publicIdSegments = segments.slice(uploadIndex + 1);
    if (publicIdSegments[0] && /^v\d+$/.test(publicIdSegments[0])) {
      publicIdSegments = publicIdSegments.slice(1);
    }
    if (publicIdSegments.length === 0) {
      return null;
    }

    const lastIndex = publicIdSegments.length - 1;
    publicIdSegments[lastIndex] = publicIdSegments[lastIndex].replace(/\.[a-z0-9]+$/i, '');
    return decodeURIComponent(publicIdSegments.join('/'));
  } catch {
    return null;
  }
}

function buildCanonicalCloudinaryPublicId(certId: string): string {
  return `certificates/${certId}`;
}

function buildCanonicalCloudinaryUrl(certId: string): string {
  return cloudinary.url(buildCanonicalCloudinaryPublicId(certId), {
    resource_type: 'raw',
    type: 'upload',
    secure: true,
    format: 'pdf',
  });
}

async function resolveCertificateCloudUrl(
  cert: Pick<CertificateFileRecord, 'certId' | 'pdfUrl'>,
): Promise<string | null> {
  if (!isCloudinaryConfigured) {
    return null;
  }

  const candidatePublicIds = new Set<string>([buildCanonicalCloudinaryPublicId(cert.certId)]);
  if (cert.pdfUrl && !isLegacyLocalCertificateUrl(cert.certId, cert.pdfUrl)) {
    const parsedPublicId = extractCloudinaryPublicIdFromUrl(cert.pdfUrl);
    if (parsedPublicId) {
      candidatePublicIds.add(parsedPublicId);
    }
  }

  let hadTransientLookupError = false;

  for (const publicId of candidatePublicIds) {
    try {
      const resource = await cloudinary.api.resource(publicId, { resource_type: 'raw' }) as { secure_url?: string };
      if (resource.secure_url) {
        return resource.secure_url;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes('not found')) {
        hadTransientLookupError = true;
        logger.warn('Cloudinary certificate lookup failed', { certId: cert.certId, publicId, error: message });
      }
    }
  }

  if (cert.pdfUrl && isCloudinaryUrl(cert.pdfUrl)) {
    return cert.pdfUrl;
  }

  // If Cloudinary API lookup is temporarily unavailable, return deterministic URL.
  // For confirmed missing resources, return null so callers can provide a clear error.
  return hadTransientLookupError ? buildCanonicalCloudinaryUrl(cert.certId) : null;
}

async function findRecipientIdByEmail(recipientEmail: string): Promise<string | null> {
  const normalizedEmail = normalizeEmail(recipientEmail);
  if (!normalizedEmail) {
    return null;
  }

  const user = await prisma.user.findFirst({
    where: {
      email: {
        equals: normalizedEmail,
        mode: 'insensitive',
      },
    },
    select: { id: true },
  });

  return user?.id ?? null;
}

async function findRecipientIdsByEmail(recipientEmails: string[]): Promise<Map<string, string>> {
  const emails = Array.from(
    new Set(
      recipientEmails
        .map((email) => normalizeEmail(email))
        .filter((email): email is string => Boolean(email)),
    ),
  );

  if (!emails.length) {
    return new Map();
  }

  const users = await prisma.user.findMany({
    where: {
      OR: emails.map((email) => ({
        email: {
          equals: email,
          mode: 'insensitive',
        },
      })),
    },
    take: 300,
    select: {
      id: true,
      email: true,
    },
  });

  return new Map(
    users
      .map((user) => [normalizeEmail(user.email), user.id] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[0])),
  );
}

async function fetchCertificateFileRecord(certId: string): Promise<CertificateFileRecord | null> {
  return prisma.certificate.findUnique({
    where: { certId },
    select: {
      certId: true,
      pdfUrl: true,
      isRevoked: true,
      recipientId: true,
      recipientEmail: true,
    },
  });
}

async function recoverMissingCertificateCloudAsset(certId: string): Promise<string | null> {
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

    const pdfBuffer = await generateCertificatePDF({
      recipientName: sanitizeText(certificate.recipientName),
      eventName: sanitizeText(certificate.eventName),
      type: certificate.type,
      position: certificate.position ? sanitizeText(certificate.position) : undefined,
      domain: certificate.domain ? sanitizeText(certificate.domain) : undefined,
      description: certificate.description ? sanitizeText(certificate.description) : undefined,
      certId: certificate.certId,
      issuedAt: certificate.issuedAt,
      signatoryName: sanitizeText(certificate.signatoryName),
      signatoryTitle: sanitizeText(certificate.signatoryTitle),
      signatoryImageUrl: certificate.signatoryImageUrl || undefined,
      facultyName: certificate.facultyName ? sanitizeText(certificate.facultyName) : undefined,
      facultyTitle: certificate.facultyTitle ? sanitizeText(certificate.facultyTitle) : undefined,
      facultySignatoryImageUrl: certificate.facultySignatoryImageUrl || undefined,
      codescrietLogoUrl: CODESCRIET_LOGO,
      ccsuLogoUrl: CCSU_LOGO,
    });

    const cloudUrl = await uploadCertificate(certificate.certId, pdfBuffer);
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

async function sendCertificateFile(
  res: Response,
  cert: Pick<CertificateFileRecord, 'certId' | 'pdfUrl'>,
  source: 'authenticated-download' | 'public-verify-download' | 'legacy-file-link',
) {
  let cloudUrl = await resolveCertificateCloudUrl(cert);
  if (!cloudUrl) {
    cloudUrl = await recoverMissingCertificateCloudAsset(cert.certId);
  }

  if (!cloudUrl) {
    if (source === 'authenticated-download') {
      return res.status(404).json({ error: 'No Cloudinary URL available for this certificate.' });
    }
    return res.status(404).send('No Cloudinary URL available for this certificate.');
  }

  if (cert.pdfUrl !== cloudUrl) {
    prisma.certificate.update({
      where: { certId: cert.certId },
      data: { pdfUrl: cloudUrl },
    }).catch((error) => {
      logger.warn('Failed to backfill certificate pdfUrl', {
        certId: cert.certId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  if (source === 'authenticated-download') {
    return res.status(200).json({ url: cloudUrl });
  }

  return res.redirect(302, cloudUrl);
}

function buildCertificateEventScope(eventName: string, eventId?: string | null) {
  if (eventId) {
    return {
      OR: [
        { eventId },
        { eventId: null, eventName },
      ],
    };
  }

  return {
    eventId: null,
    eventName,
  };
}

interface ResolvedSignatory {
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
async function resolveSignatory(
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

async function createCertificateWithSchemaFallback(
  certId: string,
  fullData: Prisma.CertificateUncheckedCreateInput,
  legacyData: Prisma.CertificateUncheckedCreateInput,
) {
  try {
    return await prisma.certificate.create({ data: fullData });
  } catch (error) {
    if (!isSchemaDriftError(error)) {
      throw error;
    }

    logger.warn('Certificate schema drift detected during create; retrying with legacy columns only', { certId });
    return prisma.certificate.create({ data: legacyData });
  }
}

async function updateCertificateWithSchemaFallback(
  certId: string,
  fullData: Prisma.CertificateUncheckedUpdateInput,
  legacyData: Prisma.CertificateUncheckedUpdateInput,
) {
  try {
    return await prisma.certificate.update({
      where: { certId },
      data: fullData,
    });
  } catch (error) {
    if (!isSchemaDriftError(error)) {
      throw error;
    }

    logger.warn('Certificate schema drift detected during update; retrying with legacy columns only', { certId });
    return prisma.certificate.update({
      where: { certId },
      data: legacyData,
    });
  }
}

// ──────────────────────────────────────────────────────────────────
// PUBLIC: Legacy certificate file endpoint retained for backward compatibility.
// Internally resolves to a Cloudinary URL and redirects.
// GET /api/certificates/files/:filename
// ──────────────────────────────────────────────────────────────────
certificatesRouter.get('/files/:filename', certificateDownloadLimiter, async (req: Request, res: Response) => {
  const { filename } = req.params;
  const certId = extractCertIdFromFilename(filename);
  if (!certId) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  try {
    const cert = await fetchCertificateFileRecord(certId);
    if (!cert) {
      return res.status(404).json({ error: 'Certificate not found.' });
    }
    if (cert.isRevoked) {
      return res.status(403).json({ error: 'Certificate has been revoked.' });
    }

    return sendCertificateFile(res, cert, 'legacy-file-link');
  } catch (error) {
    logger.error('Legacy certificate file lookup failed', { certId, error });
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ──────────────────────────────────────────────────────────────────
// PRIVATE: Download a certificate PDF by certId — cloud-only delivery.
// Only the certificate's recipient (by userId/email) or an ADMIN/PRESIDENT may download.
// GET /api/certificates/download/:certId
// ──────────────────────────────────────────────────────────────────
certificatesRouter.get('/download/:certId', certificateDownloadLimiter, authMiddleware, async (req: Request, res: Response) => {
  const authUser = getAuthUser(req)!;
  const { certId } = req.params;
  if (!/^[A-Z0-9-]{10,20}$/i.test(certId)) {
    return res.status(400).json({ error: 'Invalid certificate ID' });
  }

  const upperCertId = certId.toUpperCase();

  try {
    const cert = await fetchCertificateFileRecord(upperCertId);
    if (!cert) {
      return res.status(404).json({ error: 'Certificate not found.' });
    }
    if (cert.isRevoked) {
      return res.status(403).json({ error: 'Certificate has been revoked.' });
    }

    const isAdmin = ['ADMIN', 'PRESIDENT'].includes(authUser.role);
    if (!isAdmin && !isCertificateOwner(cert, authUser)) {
      return res.status(403).json({ error: 'You are not authorised to download this certificate.' });
    }

    return sendCertificateFile(res, cert, 'authenticated-download');
  } catch (error) {
    logger.error('Certificate download DB lookup failed', { certId: upperCertId, error });
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ──────────────────────────────────────────────────────────────────
// PUBLIC: Download through the verification flow without exposing raw storage URLs.
// GET /api/certificates/verify/:certId/download
// ──────────────────────────────────────────────────────────────────
certificatesRouter.get('/verify/:certId/download', certificateDownloadLimiter, async (req: Request, res: Response) => {
  const { certId } = req.params;
  if (!/^[A-Z0-9-]{10,20}$/i.test(certId)) {
    return res.status(400).json({ error: 'Invalid certificate ID' });
  }

  const upperCertId = certId.toUpperCase();
  try {
    const cert = await fetchCertificateFileRecord(upperCertId);
    if (!cert) {
      return res.status(404).json({ error: 'Certificate not found.' });
    }
    if (cert.isRevoked) {
      return res.status(403).json({ error: 'Certificate has been revoked.' });
    }

    return sendCertificateFile(res, cert, 'public-verify-download');
  } catch (error) {
    logger.error('Certificate verify download failed', { certId: upperCertId, error });
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ──────────────────────────────────────────────────────────────────
// PRIVATE: Admin list all certificates with pagination + filters
// GET /api/certificates
// ──────────────────────────────────────────────────────────────────
certificatesRouter.get('/', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const type = req.query.type as string | undefined;
    const search = req.query.search as string | undefined;
    const eventId = req.query.eventId as string | undefined;

    const where: Record<string, unknown> = {};
    if (type && certTypes.includes(type.toUpperCase() as (typeof certTypes)[number])) {
      where.type = type.toUpperCase();
    }
    if (eventId) where.eventId = eventId;
    if (search) {
      where.OR = [
        { recipientName: { contains: search, mode: 'insensitive' } },
        { recipientEmail: { contains: search, mode: 'insensitive' } },
        { eventName: { contains: search, mode: 'insensitive' } },
        { certId: { contains: search.toUpperCase(), mode: 'insensitive' } },
      ];
    }

    const [certificates, total] = await Promise.all([
      prisma.certificate.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          certId: true,
          recipientName: true,
          recipientEmail: true,
          eventName: true,
          type: true,
          position: true,
          domain: true,
          template: true,
          pdfUrl: true,
          issuedAt: true,
          emailSent: true,
          isRevoked: true,
          viewCount: true,
        },
      }),
      prisma.certificate.count({ where }),
    ]);

    return ApiResponse.success(res, { certificates, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    logger.error('Failed to list certificates', { error });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to fetch certificates', status: 500 });
  }
});

// ──────────────────────────────────────────────────────────────────
// PRIVATE: Generate a single certificate
// POST /api/certificates/generate
// ──────────────────────────────────────────────────────────────────
certificatesRouter.post('/generate', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const authUser = getAuthUser(req)!;

  // Check feature toggle
  const featureSettings = await prisma.settings.findUnique({ where: { id: 'default' }, select: { certificatesEnabled: true } });
  if (featureSettings && featureSettings.certificatesEnabled === false) {
    return ApiResponse.error(res, { code: ErrorCodes.FORBIDDEN, message: 'Certificate generation is currently disabled', status: 403 });
  }

  if (!isCloudinaryConfigured) {
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Certificate upload is not configured — Cloudinary credentials missing', status: 500 });
  }

  const validation = generateSchema.safeParse(req.body);
  if (!validation.success) {
    return ApiResponse.badRequest(res, validation.error.errors[0].message);
  }

  const {
    recipientName, recipientEmail, recipientId,
    eventId, eventName, type, position, domain, template,
    signatoryId, signatoryName, signatoryTitle, signatoryCustomImageUrl,
    facultySignatoryId, facultyName, facultyTitle, facultyCustomImageUrl,
    description, sendEmail,
  } = validation.data;

  try {
    let resolvedRecipientId = recipientId || null;

    // Validate recipientId exists if provided
    if (recipientId) {
      const userExists = await prisma.user.findUnique({ where: { id: recipientId }, select: { id: true } });
      if (!userExists) {
        return ApiResponse.badRequest(res, 'Recipient user not found');
      }
    } else {
      resolvedRecipientId = await findRecipientIdByEmail(recipientEmail);
    }

    // Validate eventId exists if provided
    if (eventId) {
      const eventExists = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
      if (!eventExists) {
        return ApiResponse.badRequest(res, 'Event not found');
      }
    }

    // Resolve signatories: ID → DB+image, inline base64 → processed image, text → cursive fallback
    const primarySig = await resolveSignatory(
      signatoryId, signatoryName, signatoryTitle,
      'Club President', 'Club President',
      signatoryCustomImageUrl,
    );
    const facultySig = (facultySignatoryId || facultyName?.trim() || facultyCustomImageUrl?.trim())
      ? await resolveSignatory(
          facultySignatoryId, facultyName, facultyTitle,
          '', 'Faculty Coordinator',
          facultyCustomImageUrl,
        )
      : null;

    // Generate unique cert ID, retry on collision (extremely rare)
    let certId = generateCertId();
    for (let attempt = 1; attempt <= 5; attempt++) {
      const exists = await prisma.certificate.findUnique({ where: { certId }, select: { certId: true } });
      if (!exists) break;
      if (attempt === 5) {
        return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to generate unique certificate ID. Please try again.', status: 500 });
      }
      certId = generateCertId();
    }

    // Sanitize text fields before PDF rendering
    const safeRecipientName = sanitizeText(recipientName);
    const safeEventName = sanitizeText(eventName);
    const safePosition = position ? sanitizeText(position) : undefined;
    const safeDomain = domain ? sanitizeText(domain) : undefined;
    const safeDescription = description ? sanitizeText(description) : undefined;
    const normalizedCertType = type.toUpperCase() as CertType;

    const existingCertificate = await prisma.certificate.findFirst({
      where: {
        recipientEmail: {
          equals: recipientEmail,
          mode: 'insensitive',
        },
        type: normalizedCertType,
        ...buildCertificateEventScope(safeEventName, eventId),
      },
      select: { certId: true },
    });

    if (existingCertificate) {
      return ApiResponse.badRequest(
        res,
        `A certificate for this recipient, event, and type already exists (ID: ${existingCertificate.certId})`,
      );
    }

    // Generate PDF — signature images are passed when available, PDF renderer
    // automatically falls back to GreatVibes cursive text when images are absent
    const pdfBuffer = await generateCertificatePDF({
      recipientName: safeRecipientName,
      eventName: safeEventName,
      type,
      position: safePosition,
      domain: safeDomain,
      description: safeDescription,
      certId,
      issuedAt: new Date(),
      signatoryName: primarySig.name,
      signatoryTitle: primarySig.title,
      signatoryImageUrl: primarySig.processedImageUrl,
      facultyName: facultySig?.name || undefined,
      facultyTitle: facultySig?.title || undefined,
      facultySignatoryImageUrl: facultySig?.processedImageUrl,
      codescrietLogoUrl: CODESCRIET_LOGO,
      ccsuLogoUrl: CCSU_LOGO,
    });

    // Upload to storage
    const pdfUrl = await uploadCertificate(certId, pdfBuffer);
    const downloadUrl = buildPublicCertificateDownloadUrl(certId);

    // Persist to database with signatory snapshot
    const legacyCertificateData: Prisma.CertificateUncheckedCreateInput = {
      certId,
      recipientName: safeRecipientName,
      recipientEmail,
      recipientId: resolvedRecipientId,
      eventId: eventId || null,
      eventName: safeEventName,
      type: normalizedCertType,
      position: safePosition || null,
      domain: safeDomain || null,
      template,
      pdfUrl,
      issuedBy: authUser.id,
    };
    const certificate = await createCertificateWithSchemaFallback(
      certId,
      {
        ...legacyCertificateData,
        description: safeDescription || null,
        signatoryId: primarySig.id,
        signatoryName: primarySig.name,
        signatoryTitle: primarySig.title,
        signatoryImageUrl: primarySig.rawImageUrl,
        facultySignatoryId: facultySig?.id || null,
        facultyName: facultySig?.name || null,
        facultyTitle: facultySig?.title || null,
        facultySignatoryImageUrl: facultySig?.rawImageUrl || null,
      },
      legacyCertificateData,
    );

    // Optionally send email
    if (sendEmail) {
      emailService.sendCertificateIssued(recipientEmail, recipientName, eventName, certId, downloadUrl)
        .then(async (sent) => {
          if (sent) {
            try {
              await prisma.certificate.update({
                where: { certId },
                data: { emailSent: true, emailSentAt: new Date() },
              });
            } catch (dbErr) {
              logger.error('Failed to update emailSent flag after successful send', { certId, error: dbErr instanceof Error ? dbErr.message : String(dbErr) });
            }
          }
        })
        .catch(err => logger.error('Certificate email failed', { certId, error: err.message }));
    }

    logger.info('Certificate generated', { certId, recipientEmail, eventName, type, issuedBy: authUser.id });
    await auditLog(authUser.id, 'CERTIFICATE_GENERATE', 'certificate', certId, { recipientEmail, eventName, type });

    return ApiResponse.success(res, {
      certId: certificate.certId,
      pdfUrl,
      downloadUrl,
      verifyUrl: buildCertificateVerifyUrl(certId),
    }, 'Certificate generated successfully');
  } catch (error: unknown) {
    if ((error as any)?.code === 'P2002') {
      return ApiResponse.badRequest(res, 'A certificate for this recipient/event/type combination already exists');
    }
    const err = error as Error;
    logger.error('Certificate generation failed', { message: err?.message, stack: err?.stack });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Certificate generation failed. Please try again.', status: 500 });
  }
});

// ──────────────────────────────────────────────────────────────────
// PRIVATE: Bulk certificate generation
// POST /api/certificates/bulk
// ──────────────────────────────────────────────────────────────────
certificatesRouter.post('/bulk', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const authUser = getAuthUser(req)!;

  // Check feature toggle
  const featureSettings = await prisma.settings.findUnique({ where: { id: 'default' }, select: { certificatesEnabled: true } });
  if (featureSettings && featureSettings.certificatesEnabled === false) {
    return ApiResponse.error(res, { code: ErrorCodes.FORBIDDEN, message: 'Certificate generation is currently disabled', status: 403 });
  }

  if (!isCloudinaryConfigured) {
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Certificate upload is not configured — Cloudinary credentials missing', status: 500 });
  }

  const validation = bulkSchema.safeParse(req.body);
  if (!validation.success) {
    return ApiResponse.badRequest(res, validation.error.errors[0].message);
  }

  const {
    recipients, eventId, eventName, type, template,
    signatoryId, signatoryName, signatoryTitle, signatoryCustomImageUrl,
    facultySignatoryId, facultyName, facultyTitle, facultyCustomImageUrl,
    description, domain, sendEmail, source, generationStrategy, selectedRoundIds,
  } = validation.data;

  // Validate eventId if provided
  if (eventId) {
    const eventExists = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!eventExists) {
      return ApiResponse.badRequest(res, 'Event not found');
    }
  }

  // Resolve signatories once for the entire batch (image processing is expensive)
  const primarySig = await resolveSignatory(
    signatoryId, signatoryName, signatoryTitle,
    'Club President', 'Club President',
    signatoryCustomImageUrl,
  );
  const facultySig = (facultySignatoryId || facultyName?.trim() || facultyCustomImageUrl?.trim())
    ? await resolveSignatory(
        facultySignatoryId, facultyName, facultyTitle,
        '', 'Faculty Coordinator',
        facultyCustomImageUrl,
      )
    : null;

  // Sanitize shared text fields once
  const safeEventName   = sanitizeText(eventName);
  const resolvedRecipients = recipients.map((recipient) =>
    resolveBulkRecipient(recipient, {
      type,
      template,
      description,
      domain,
    }),
  );

  if (source === 'competition' && resolvedRecipients.some((recipient) => !recipient.description)) {
    return ApiResponse.badRequest(res, 'Competition certificates require a non-empty description for every recipient');
  }

  const successes: Array<{ certId: string; pdfUrl: string; name: string; email: string; type: CertType }> = [];
  const failures: Array<{ name: string; email: string; reason: string }> = [];
  let emailsSent = 0;
  let emailsFailed = 0;
  const providedUserIds = Array.from(
    new Set(resolvedRecipients.map((recipient) => recipient.userId).filter((userId): userId is string => Boolean(userId))),
  );
  const validUserIds = new Set(
    providedUserIds.length
      ? (await prisma.user.findMany({
        where: { id: { in: providedUserIds } },
        take: 300,
        select: { id: true },
      })).map((user) => user.id)
      : [],
  );

  const involvedTypes = Array.from(new Set(resolvedRecipients.map((recipient) => recipient.type)));
  const existingCertificates = await prisma.certificate.findMany({
    where: {
      OR: Array.from(new Set(resolvedRecipients.map((recipient) => recipient.email))).map((email) => ({
        recipientEmail: {
          equals: email,
          mode: 'insensitive',
        },
      })),
      type: { in: involvedTypes },
      ...buildCertificateEventScope(safeEventName, eventId),
    },
    take: 300,
    select: {
      recipientEmail: true,
      certId: true,
      type: true,
      position: true,
      description: true,
    },
  });
  const existingByEmail = new Map(
    existingCertificates.map((certificate) => [
      buildRecipientDuplicateKey(
        source,
        certificate.recipientEmail,
        certificate.type,
        certificate.position,
        certificate.description,
      ),
      certificate.certId,
    ]),
  );
  const queuedRecipientKeys = new Set<string>();
  const recipientsToProcess = resolvedRecipients.filter((recipient) => {
    const duplicateKey = buildRecipientDuplicateKey(
      source,
      recipient.email,
      recipient.type,
      recipient.position,
      recipient.description,
    );

    if (recipient.userId && !validUserIds.has(recipient.userId)) {
      failures.push({
        name: recipient.name,
        email: recipient.email,
        reason: 'Recipient user not found',
      });
      return false;
    }

    if (queuedRecipientKeys.has(duplicateKey)) {
      failures.push({
        name: recipient.name,
        email: recipient.email,
        reason: 'Duplicate recipient email in this bulk upload',
      });
      return false;
    }

    queuedRecipientKeys.add(duplicateKey);

    const existingCertId = existingByEmail.get(duplicateKey);
    if (existingCertId) {
      failures.push({
        name: recipient.name,
        email: recipient.email,
        reason: `Certificate already exists for this recipient (ID: ${existingCertId})`,
      });
      return false;
    }

    return true;
  });
  const recipientIdByEmail = await findRecipientIdsByEmail(recipientsToProcess.map((recipient) => recipient.email));

  // Process in batches of 5 to limit memory/concurrency
  const BATCH_SIZE = 3;
  for (let i = 0; i < recipientsToProcess.length; i += BATCH_SIZE) {
    const batch = recipientsToProcess.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (r) => {
        try {
          // Generate unique cert ID with collision retry
          let certId = generateCertId();
          for (let attempt = 1; attempt <= 5; attempt++) {
            const exists = await prisma.certificate.findUnique({ where: { certId }, select: { certId: true } });
            if (!exists) break;
            if (attempt === 5) {
              failures.push({ name: r.name, email: r.email, reason: 'Could not generate unique certificate ID' });
              return;
            }
            certId = generateCertId();
          }

          const pdfBuffer = await generateCertificatePDF({
            recipientName: r.name,
            eventName: safeEventName,
            type: r.type,
            position: r.position || undefined,
            domain: r.domain || undefined,
            description: r.description || undefined,
            teamName: r.teamName || undefined,
            certId,
            issuedAt: new Date(),
            signatoryName: primarySig.name,
            signatoryTitle: primarySig.title,
            signatoryImageUrl: primarySig.processedImageUrl,
            facultyName: facultySig?.name || undefined,
            facultyTitle: facultySig?.title || undefined,
            facultySignatoryImageUrl: facultySig?.processedImageUrl,
            codescrietLogoUrl: CODESCRIET_LOGO,
            ccsuLogoUrl: CCSU_LOGO,
          });

          const pdfUrl = await uploadCertificate(certId, pdfBuffer);
          const downloadUrl = buildPublicCertificateDownloadUrl(certId);
          const resolvedRecipientId = r.userId || recipientIdByEmail.get(r.normalizedEmail) || null;

          const legacyCertificateData: Prisma.CertificateUncheckedCreateInput = {
            certId,
            recipientName: r.name,
            recipientEmail: r.email,
            recipientId: resolvedRecipientId,
            eventId: eventId || null,
            eventName: safeEventName,
            type: r.type,
            position: r.position,
            domain: r.domain,
            template: r.template,
            pdfUrl,
            issuedBy: authUser.id,
          };
          await createCertificateWithSchemaFallback(
            certId,
            {
              ...legacyCertificateData,
              description: r.description,
              signatoryId: primarySig.id,
              signatoryName: primarySig.name,
              signatoryTitle: primarySig.title,
              signatoryImageUrl: primarySig.rawImageUrl,
              facultySignatoryId: facultySig?.id || null,
              facultyName: facultySig?.name || null,
              facultyTitle: facultySig?.title || null,
              facultySignatoryImageUrl: facultySig?.rawImageUrl || null,
            },
            legacyCertificateData,
          );

          if (sendEmail) {
            try {
              const sent = await emailService.sendCertificateIssued(r.email, r.name, safeEventName, certId, downloadUrl);
              if (sent) {
                emailsSent++;
                await updateCertificateWithSchemaFallback(
                  certId,
                  { emailSent: true, emailSentAt: new Date(), lastEmailResentAt: null },
                  { emailSent: true, emailSentAt: new Date() },
                );
              } else {
                emailsFailed++;
              }
            } catch (err) {
              emailsFailed++;
              logger.error('Bulk certificate email failed', { certId, email: r.email, error: err instanceof Error ? err.message : String(err) });
            }
          }

          successes.push({ certId, pdfUrl, name: r.name, email: r.email, type: r.type });
        } catch (err) {
          const code = (err as { code?: string } | null)?.code;
          if (code === 'P2002') {
            failures.push({
              name: r.name,
              email: r.email,
              reason: 'A certificate for this recipient already exists (concurrent request detected).',
            });
            return;
          }

          const msg = err instanceof Error ? err.message : 'Unknown error';
          failures.push({ name: r.name, email: r.email, reason: msg });
          logger.error('Bulk cert generation failed for recipient', { name: r.name, email: r.email, error: msg });
        }
      }),
    );
  }

  logger.info('Bulk certificate generation complete', {
    generated: successes.length,
    failed: failures.length,
    eventName,
    issuedBy: authUser.id,
    source,
  });

  const generatedByType = successes.reduce<Record<string, number>>((accumulator, success) => {
    const nextCount = accumulator[success.type] ?? 0;
    return {
      ...accumulator,
      [success.type]: nextCount + 1,
    };
  }, {});

  await auditLog(authUser.id, 'CERTIFICATE_BULK_GENERATE', 'certificate', undefined, {
    eventName,
    type: type || null,
    generated: successes.length,
    failed: failures.length,
    total: recipients.length,
    source,
    generationStrategy: generationStrategy || null,
    selectedRoundIds: selectedRoundIds || [],
    generatedByType,
  });

  return ApiResponse.success(res, {
    generated: successes.length,
    failed: failures.length,
    results: successes,
    errors: failures,
    ...(sendEmail ? { emailsSent, emailsFailed } : {}),
  }, `Generated ${successes.length}/${recipients.length} certificates`);
});

// ──────────────────────────────────────────────────────────────────
// PUBLIC: Verify a certificate (no auth required)
// GET /api/certificates/verify/:certId
// ──────────────────────────────────────────────────────────────────
certificatesRouter.get('/verify/:certId', certificateVerifyLimiter, async (req: Request, res: Response) => {
  const { certId } = req.params;
  if (!certId || certId.length > 20) {
    return res.status(400).json({ valid: false, reason: 'invalid_id' });
  }

  try {
    const cert = await prisma.certificate.findUnique({
      where: { certId: certId.toUpperCase() },
      select: {
        certId: true,
        recipientName: true,
        eventName: true,
        type: true,
        position: true,
        domain: true,
        template: true,
        issuedAt: true,
        // pdfUrl intentionally excluded - use downloadUrl instead for access control
        isRevoked: true,
        revokedReason: true,
      },
    });

    if (!cert) {
      return res.status(404).json({ valid: false, reason: 'not_found' });
    }

    if (cert.isRevoked) {
      return res.status(200).json({ valid: false, reason: 'revoked', revokedReason: cert.revokedReason });
    }

    // Increment view count asynchronously
    prisma.certificate.update({
      where: { certId: cert.certId },
      data: { viewCount: { increment: 1 } },
    }).catch(() => {});

    return res.status(200).json({
      valid: true,
      certId: cert.certId,
      recipientName: cert.recipientName,
      eventName: cert.eventName,
      type: cert.type,
      position: cert.position,
      domain: cert.domain,
      template: cert.template,
      issuedAt: cert.issuedAt,
      downloadUrl: buildPublicCertificateDownloadUrl(cert.certId),
    });
  } catch (error) {
    logger.error('Certificate verify failed', { certId, error });
    return res.status(500).json({ valid: false, reason: 'server_error' });
  }
});

// ──────────────────────────────────────────────────────────────────
// PRIVATE: Member fetches their own certificates
// GET /api/certificates/mine
// ──────────────────────────────────────────────────────────────────
certificatesRouter.get('/mine', authMiddleware, async (req: Request, res: Response) => {
  const authUser = getAuthUser(req)!;
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const type = req.query.type as string | undefined;
    const sort = (req.query.sort as string) === 'asc' ? 'asc' as const : 'desc' as const;

    const where: Record<string, unknown> = {
      OR: [
        { recipientId: authUser.id },
        {
          recipientEmail: {
            equals: authUser.email,
            mode: 'insensitive',
          },
        },
      ],
      isRevoked: false,
    };
    if (type && ['PARTICIPATION', 'COMPLETION', 'WINNER', 'SPEAKER'].includes(type.toUpperCase())) {
      where.type = type.toUpperCase();
    }

    const [certificates, total] = await Promise.all([
      prisma.certificate.findMany({
        where,
        orderBy: { issuedAt: sort },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          certId: true,
          recipientName: true,
          eventName: true,
          type: true,
          position: true,
          domain: true,
          template: true,
          issuedAt: true,
          pdfUrl: true,
        },
      }),
      prisma.certificate.count({ where }),
    ]);

    return ApiResponse.success(res, { certificates, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    logger.error('Failed to fetch user certificates', { userId: authUser.id, error });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to fetch certificates', status: 500 });
  }
});

// ──────────────────────────────────────────────────────────────────
// PRIVATE: Admin revoke a certificate
// PATCH /api/certificates/:certId/revoke
// ──────────────────────────────────────────────────────────────────
certificatesRouter.patch('/:certId/revoke', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const authUser = getAuthUser(req)!;
  const upperCertId = req.params.certId.toUpperCase();

  const validation = revokeSchema.safeParse(req.body);
  if (!validation.success) {
    return ApiResponse.badRequest(res, validation.error.errors[0].message);
  }

  try {
    const cert = await prisma.certificate.findUnique({
      where: { certId: upperCertId },
      select: {
        certId: true,
        isRevoked: true,
      },
    });
    if (!cert) {
      return ApiResponse.error(res, { code: ErrorCodes.NOT_FOUND, message: 'Certificate not found', status: 404 });
    }
    if (cert.isRevoked) {
      return ApiResponse.badRequest(res, 'Certificate is already revoked');
    }

    await prisma.certificate.update({
      where: { certId: upperCertId },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedBy: authUser.id,
        revokedReason: validation.data.reason || 'Revoked by admin',
      },
    });

    logger.info('Certificate revoked', { certId: upperCertId, revokedBy: authUser.id });
    await auditLog(authUser.id, 'CERTIFICATE_REVOKE', 'certificate', upperCertId, { reason: validation.data.reason });
    return ApiResponse.success(res, { certId: upperCertId }, 'Certificate revoked');
  } catch (error) {
    logger.error('Failed to revoke certificate', { certId: upperCertId, error });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to revoke certificate', status: 500 });
  }
});

// ──────────────────────────────────────────────────────────────────
// PRIVATE: Admin delete a certificate
// DELETE /api/certificates/:certId
// ──────────────────────────────────────────────────────────────────
certificatesRouter.delete('/:certId', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const authUser = getAuthUser(req)!;
  const upperCertId = req.params.certId.toUpperCase();

  try {
    const cert = await prisma.certificate.findUnique({
      where: { certId: upperCertId },
      select: { certId: true },
    });
    if (!cert) {
      return ApiResponse.error(res, { code: ErrorCodes.NOT_FOUND, message: 'Certificate not found', status: 404 });
    }

    await prisma.certificate.delete({
      where: { certId: upperCertId },
    });

    logger.info('Certificate deleted', { certId: upperCertId, deletedBy: authUser.id });
    await auditLog(authUser.id, 'CERTIFICATE_DELETE', 'certificate', upperCertId, { action: 'deleted' });
    return ApiResponse.success(res, { certId: upperCertId }, 'Certificate deleted from database');
  } catch (error) {
    logger.error('Failed to delete certificate', { certId: upperCertId, error });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to delete certificate', status: 500 });
  }
});

// ──────────────────────────────────────────────────────────────────
// PRIVATE: Admin resend certificate email
// POST /api/certificates/:certId/resend
// ──────────────────────────────────────────────────────────────────
certificatesRouter.post('/:certId/resend', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const upperCertId = req.params.certId.toUpperCase();

  try {
    let cert:
      | {
          certId: string;
          recipientEmail: string;
          recipientName: string;
          eventName: string;
          pdfUrl: string | null;
          isRevoked: boolean;
          lastEmailResentAt: Date | null;
        }
      | null;

    try {
      cert = await prisma.certificate.findUnique({
        where: { certId: upperCertId },
        select: {
          certId: true,
          recipientEmail: true,
          recipientName: true,
          eventName: true,
          pdfUrl: true,
          isRevoked: true,
          lastEmailResentAt: true,
        },
      });
    } catch (error) {
      if (!isSchemaDriftError(error)) {
        throw error;
      }

      logger.warn('Certificate schema drift detected during resend lookup; retrying with legacy columns only', { certId: upperCertId });
      const legacyCert = await prisma.certificate.findUnique({
        where: { certId: upperCertId },
        select: {
          certId: true,
          recipientEmail: true,
          recipientName: true,
          eventName: true,
          pdfUrl: true,
          isRevoked: true,
        },
      });
      cert = legacyCert ? { ...legacyCert, lastEmailResentAt: null } : null;
    }

    if (!cert) {
      return ApiResponse.error(res, { code: ErrorCodes.NOT_FOUND, message: 'Certificate not found', status: 404 });
    }
    if (cert.isRevoked) {
      return ApiResponse.badRequest(res, 'Cannot resend a revoked certificate');
    }

    // Rate limit: one resend per 10 minutes per certificate
    if (cert.lastEmailResentAt && (Date.now() - cert.lastEmailResentAt.getTime()) < RESEND_COOLDOWN_MS) {
      const waitMinutes = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - cert.lastEmailResentAt.getTime())) / 60000);
      return ApiResponse.badRequest(res, `Please wait ${waitMinutes} minute(s) before resending this certificate email`);
    }

    const sent = await emailService.sendCertificateIssued(
      cert.recipientEmail,
      cert.recipientName,
      cert.eventName,
      cert.certId,
      buildPublicCertificateDownloadUrl(cert.certId),
    );

    if (sent) {
      await updateCertificateWithSchemaFallback(
        upperCertId,
        { emailSent: true, emailSentAt: new Date(), lastEmailResentAt: new Date() },
        { emailSent: true, emailSentAt: new Date() },
      );
    }

    await auditLog(getAuthUser(req)!.id, 'CERTIFICATE_RESEND', 'certificate', upperCertId, { sent });
    return ApiResponse.success(res, { sent }, sent ? 'Email sent' : 'Email service not configured');
  } catch (error) {
    logger.error('Failed to resend certificate email', { certId: upperCertId, error });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to resend email', status: 500 });
  }
});

// ──────────────────────────────────────────────────────────────────
// PRIVATE: Admin get single certificate by certId
// GET /api/certificates/:certId
// ──────────────────────────────────────────────────────────────────
certificatesRouter.get('/:certId', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { certId } = req.params;

  try {
    let cert;
    try {
      cert = await prisma.certificate.findUnique({
        where: { certId: certId.toUpperCase() },
        select: {
          id: true,
          certId: true,
          recipientId: true,
          recipientName: true,
          recipientEmail: true,
          eventId: true,
          eventName: true,
          type: true,
          position: true,
          domain: true,
          description: true,
          template: true,
          pdfUrl: true,
          issuedBy: true,
          issuedAt: true,
          emailSent: true,
          emailSentAt: true,
          lastEmailResentAt: true,
          isRevoked: true,
          revokedAt: true,
          revokedBy: true,
          revokedReason: true,
          viewCount: true,
          createdAt: true,
          updatedAt: true,
          signatoryName: true,
          signatoryTitle: true,
          signatoryImageUrl: true,
          facultyName: true,
          facultyTitle: true,
          facultySignatoryImageUrl: true,
        },
      });
    } catch (error) {
      if (!isSchemaDriftError(error)) {
        throw error;
      }

      logger.warn('Certificate schema drift detected during single-certificate lookup; retrying with legacy columns only', { certId });
      cert = await prisma.certificate.findUnique({
        where: { certId: certId.toUpperCase() },
        select: {
          id: true,
          certId: true,
          recipientId: true,
          recipientName: true,
          recipientEmail: true,
          eventId: true,
          eventName: true,
          type: true,
          position: true,
          domain: true,
          template: true,
          pdfUrl: true,
          issuedBy: true,
          issuedAt: true,
          emailSent: true,
          emailSentAt: true,
          isRevoked: true,
          revokedAt: true,
          revokedBy: true,
          revokedReason: true,
          viewCount: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    }
    if (!cert) {
      return ApiResponse.error(res, { code: ErrorCodes.NOT_FOUND, message: 'Certificate not found', status: 404 });
    }
    return ApiResponse.success(res, cert);
  } catch (error) {
    logger.error('Failed to get certificate', { certId, error });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to fetch certificate', status: 500 });
  }
});
