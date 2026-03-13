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
const LOCAL_CERT_DIR = path.join(__dirname, '..', '..', 'uploads', 'certificates');
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
  signatoryName: z.string().max(100).optional().nullable(),
  signatoryTitle: z.string().max(100).optional().nullable(),
  facultyName: z.string().max(100).optional().nullable(),
  facultyTitle: z.string().max(100).optional().nullable(),
  sendEmail: z.boolean().default(false),
});

const bulkSchema = z.object({
  recipients: z.array(z.object({
    name: z.string().min(2).max(100),
    email: z.string().email().transform(v => v.trim().toLowerCase()),
    userId: z.string().optional().nullable(),
    position: z.string().max(100).optional().nullable(),
  })).min(1).max(200),
  eventId: z.string().optional().nullable(),
  eventName: z.string().min(2).max(200),
  type: z.enum(certTypes),
  template: z.enum(certTemplates).default('gold'),
  signatoryName: z.string().max(100).optional().nullable(),
  signatoryTitle: z.string().max(100).optional().nullable(),
  facultyName: z.string().max(100).optional().nullable(),
  facultyTitle: z.string().max(100).optional().nullable(),
  description: z.string().max(400).optional().nullable(),
  domain: z.string().max(100).optional().nullable(),
  sendEmail: z.boolean().default(false),
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

function normalizeEmail(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function buildCertificateVerifyUrl(certId: string): string {
  return `${FRONTEND_URL}/verify/${certId}`;
}

function buildCertificateLocalPath(certId: string): string {
  return path.join(LOCAL_CERT_DIR, `${certId}.pdf`);
}

function extractCertIdFromFilename(filename: string): string | null {
  const match = filename.match(/^([A-Z0-9\-]{10,20})\.pdf$/i);
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

async function sendCertificateFile(
  res: Response,
  cert: Pick<CertificateFileRecord, 'certId' | 'pdfUrl'>,
  source: 'authenticated-download' | 'public-verify-download' | 'legacy-file-link',
) {
  const localPath = buildCertificateLocalPath(cert.certId);

  // If we have a copy stored locally physically, we can just send it back.
  if (fs.existsSync(localPath)) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${cert.certId}.pdf"`);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.sendFile(localPath);
  }

  if (!cert.pdfUrl) {
    if (source === 'authenticated-download') {
      return res.status(404).json({ error: 'No PDF available for this certificate.' });
    }
    return res.status(404).send('No PDF available for this certificate.');
  }

  if (isLegacyLocalCertificateUrl(cert.certId, cert.pdfUrl)) {
    if (source === 'authenticated-download') {
      return res.status(404).json({ error: 'Stored certificate file is unavailable on this server.' });
    }
    return res.status(404).send('Stored certificate file is unavailable on this server.');
  }

  // To bypass Cloudinary's strict bot-protection which blocks Render IPs (502 Gateway),
  // we do not fetch it from the backend API.
  // Instead, we return the URL back to the client to open Native (for authenticated fetches)
  // or we natively HTTP redirect the browser directly to Cloudinary (for public verifications).
  let finalUrl = cert.pdfUrl;

  // Cloudinary requires signed URLs for strict delivery.
  // CRITICAL: The resource_type in the signed URL MUST match the resource_type
  // used during upload, otherwise Cloudinary returns ERR_INVALID_RESPONSE.
  // Old certs used 'raw', new ones use 'raw' too. Detect from stored URL to be safe.
  if (isCloudinaryConfigured && finalUrl.includes('cloudinary.com')) {
    // Detect resource_type from the stored URL path: /raw/upload/ or /image/upload/
    let detectedResourceType: 'raw' | 'image' = 'raw';
    if (finalUrl.includes('/image/upload/')) {
      detectedResourceType = 'image';
    }

    finalUrl = cloudinary.url(`certificates/${cert.certId}.pdf`, {
      resource_type: detectedResourceType,
      type: 'upload',
      sign_url: true,
      secure: true,
    });
  }

  if (source === 'authenticated-download') {
    return res.status(200).json({ url: finalUrl });
  } else {
    return res.redirect(finalUrl);
  }
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
// PRIVATE: Download a certificate PDF by certId — proxies local file or Cloudinary.
// Only the certificate's recipient (by userId/email) or an ADMIN/PRESIDENT may download.
// GET /api/certificates/download/:certId
// ──────────────────────────────────────────────────────────────────
certificatesRouter.get('/download/:certId', certificateDownloadLimiter, authMiddleware, async (req: Request, res: Response) => {
  const authUser = getAuthUser(req)!;
  const { certId } = req.params;
  if (!/^[A-Z0-9\-]{10,20}$/i.test(certId)) {
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
  if (!/^[A-Z0-9\-]{10,20}$/i.test(certId)) {
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

  const validation = generateSchema.safeParse(req.body);
  if (!validation.success) {
    return ApiResponse.badRequest(res, validation.error.errors[0].message);
  }

  const {
    recipientName, recipientEmail, recipientId,
    eventId, eventName, type, position, domain, template,
    signatoryName, signatoryTitle,
    facultyName, facultyTitle,
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

    // Compose signatory info from form values
    const finalSignatoryName = sanitizeText(signatoryName?.trim() || 'Club President');
    const finalSignatoryTitle = sanitizeText(signatoryTitle?.trim() || 'Club President');
    const finalFacultyName = facultyName?.trim() ? sanitizeText(facultyName) : undefined;
    const finalFacultyTitle = facultyName?.trim()
      ? sanitizeText(facultyTitle?.trim() || 'Faculty Coordinator')
      : undefined;

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

    // Generate PDF
    const pdfBuffer = await generateCertificatePDF({
      recipientName: safeRecipientName,
      eventName: safeEventName,
      type,
      position: safePosition,
      domain: safeDomain,
      description: safeDescription,
      certId,
      issuedAt: new Date(),
      signatoryName: finalSignatoryName,
      signatoryTitle: finalSignatoryTitle,
      facultyName: finalFacultyName,
      facultyTitle: finalFacultyTitle,
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
        signatoryName: finalSignatoryName,
        signatoryTitle: finalSignatoryTitle,
        facultyName: finalFacultyName || null,
        facultyTitle: finalFacultyTitle || null,
      },
      legacyCertificateData,
    );

    // Optionally send email
    if (sendEmail) {
      emailService.sendCertificateIssued(recipientEmail, recipientName, eventName, certId, downloadUrl)
        .then(async (sent) => {
          if (sent) {
            await prisma.certificate.update({
              where: { certId },
              data: { emailSent: true, emailSentAt: new Date() },
            });
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
    const err = error as Error;
    logger.error('Certificate generation failed', { message: err?.message, stack: err?.stack });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: `Certificate generation failed: ${err?.message ?? 'unknown'}`, status: 500 });
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

  const validation = bulkSchema.safeParse(req.body);
  if (!validation.success) {
    return ApiResponse.badRequest(res, validation.error.errors[0].message);
  }

  const {
    recipients, eventId, eventName, type, template,
    signatoryName, signatoryTitle,
    facultyName, facultyTitle,
    description, domain, sendEmail,
  } = validation.data;

  // Validate eventId if provided
  if (eventId) {
    const eventExists = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!eventExists) {
      return ApiResponse.badRequest(res, 'Event not found');
    }
  }

  // Compose signatory info from form values
  const finalSignatoryName = sanitizeText(signatoryName?.trim() || 'Club President');
  const finalSignatoryTitle = sanitizeText(signatoryTitle?.trim() || 'Club President');
  const finalFacultyName = facultyName?.trim() ? sanitizeText(facultyName) : undefined;
  const finalFacultyTitle = facultyName?.trim()
    ? sanitizeText(facultyTitle?.trim() || 'Faculty Coordinator')
    : undefined;

  // Sanitize shared text fields once
  const safeEventName   = sanitizeText(eventName);
  const safeDomain      = domain ? sanitizeText(domain) : undefined;
  const safeDescription = description ? sanitizeText(description) : undefined;
  const normalizedCertType = type.toUpperCase() as CertType;

  const successes: Array<{ certId: string; pdfUrl: string; name: string; email: string }> = [];
  const failures: Array<{ name: string; email: string; reason: string }> = [];
  let emailsSent = 0;
  let emailsFailed = 0;
  const providedUserIds = Array.from(
    new Set(recipients.map((recipient) => recipient.userId).filter((userId): userId is string => Boolean(userId))),
  );
  const validUserIds = new Set(
    providedUserIds.length
      ? (await prisma.user.findMany({
        where: { id: { in: providedUserIds } },
        select: { id: true },
      })).map((user) => user.id)
      : [],
  );

  const existingCertificates = await prisma.certificate.findMany({
    where: {
      OR: Array.from(new Set(recipients.map((recipient) => recipient.email))).map((email) => ({
        recipientEmail: {
          equals: email,
          mode: 'insensitive',
        },
      })),
      type: normalizedCertType,
      ...buildCertificateEventScope(safeEventName, eventId),
    },
    select: {
      recipientEmail: true,
      certId: true,
    },
  });
  const existingByEmail = new Map(
    existingCertificates.map((certificate) => [normalizeEmail(certificate.recipientEmail) ?? certificate.recipientEmail, certificate.certId]),
  );
  const queuedEmails = new Set<string>();
  const recipientsToProcess = recipients.filter((recipient) => {
    const normalizedRecipientEmail = normalizeEmail(recipient.email) ?? recipient.email;

    if (recipient.userId && !validUserIds.has(recipient.userId)) {
      failures.push({
        name: recipient.name,
        email: recipient.email,
        reason: 'Recipient user not found',
      });
      return false;
    }

    if (queuedEmails.has(normalizedRecipientEmail)) {
      failures.push({
        name: recipient.name,
        email: recipient.email,
        reason: 'Duplicate recipient email in this bulk upload',
      });
      return false;
    }

    queuedEmails.add(normalizedRecipientEmail);

    const existingCertId = existingByEmail.get(normalizedRecipientEmail);
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
  const BATCH_SIZE = 5;
  for (let i = 0; i < recipientsToProcess.length; i += BATCH_SIZE) {
    const batch = recipientsToProcess.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (r) => {
        try {
          const safeName = sanitizeText(r.name);
          const safePosition = r.position ? sanitizeText(r.position) : undefined;

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
            recipientName: safeName,
            eventName: safeEventName,
            type,
            position: safePosition,
            domain: safeDomain,
            description: safeDescription,
            certId,
            issuedAt: new Date(),
            signatoryName: finalSignatoryName,
            signatoryTitle: finalSignatoryTitle,
            facultyName: finalFacultyName,
            facultyTitle: finalFacultyTitle,
            codescrietLogoUrl: CODESCRIET_LOGO,
            ccsuLogoUrl: CCSU_LOGO,
          });

          const pdfUrl = await uploadCertificate(certId, pdfBuffer);
          const downloadUrl = buildPublicCertificateDownloadUrl(certId);
          const resolvedRecipientId = r.userId || recipientIdByEmail.get(normalizeEmail(r.email) ?? r.email) || null;

          const legacyCertificateData: Prisma.CertificateUncheckedCreateInput = {
            certId,
            recipientName: safeName,
            recipientEmail: r.email,
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
          await createCertificateWithSchemaFallback(
            certId,
            {
              ...legacyCertificateData,
              description: safeDescription || null,
              signatoryName: finalSignatoryName,
              signatoryTitle: finalSignatoryTitle,
              facultyName: finalFacultyName || null,
              facultyTitle: finalFacultyTitle || null,
            },
            legacyCertificateData,
          );

          if (sendEmail) {
            try {
              const sent = await emailService.sendCertificateIssued(r.email, r.name, eventName, certId, downloadUrl);
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

          successes.push({ certId, pdfUrl, name: r.name, email: r.email });
        } catch (err) {
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
  });

  await auditLog(authUser.id, 'CERTIFICATE_BULK_GENERATE', 'certificate', undefined, {
    eventName, type, generated: successes.length, failed: failures.length, total: recipients.length,
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
        pdfUrl: true,
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
      ...cert,
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
