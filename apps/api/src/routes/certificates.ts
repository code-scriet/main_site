import { Router, Request, Response } from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CertType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ApiResponse, ErrorCodes } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { generateCertId } from '../utils/generateCertId.js';
import { generateCertificatePDF } from '../utils/generateCertificatePDF.js';
import { uploadCertificate } from '../utils/uploadCertificate.js';
import { emailService } from '../utils/email.js';

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
  signatoryName: z.string().max(100).default('Club President'),
  facultyName: z.string().max(100).optional().nullable(),
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
  template: z.enum(certTemplates).default('dark'),
  signatoryName: z.string().max(100).default('Club President'),
  facultyName: z.string().max(100).optional().nullable(),
  description: z.string().max(400).optional().nullable(),
  sendEmail: z.boolean().default(false),
});

const revokeSchema = z.object({
  reason: z.string().max(500).optional(),
});

// ──────────────────────────────────────────────────────────────────
// PUBLIC: Serve locally-stored certificate PDF files (MUST be first to avoid /:certId conflict)
// GET /api/certificates/files/:filename
// ──────────────────────────────────────────────────────────────────
certificatesRouter.get('/files/:filename', (req: Request, res: Response) => {
  const { filename } = req.params;
  // Only allow safe filenames: alphanumeric + hyphens + .pdf
  if (!/^[A-Z0-9\-]{10,20}\.pdf$/i.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = path.join(LOCAL_CERT_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Certificate file not found.' });
  }
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.sendFile(filePath);
});

// ──────────────────────────────────────────────────────────────────
// PRIVATE: Download a certificate PDF by certId — proxies local file or Cloudinary.
// Only the certificate's recipient (by userId) or an ADMIN may download.
// GET /api/certificates/download/:certId
// ──────────────────────────────────────────────────────────────────
certificatesRouter.get('/download/:certId', authMiddleware, async (req: Request, res: Response) => {
  const authUser = getAuthUser(req)!;
  const { certId } = req.params;
  if (!/^[A-Z0-9\-]{10,20}$/i.test(certId)) {
    return res.status(400).json({ error: 'Invalid certificate ID' });
  }

  const upperCertId = certId.toUpperCase();

  // Fetch certificate to validate ownership
  let cert: { pdfUrl: string | null; isRevoked: boolean; recipientId: string | null } | null;
  try {
    cert = await prisma.certificate.findUnique({
      where: { certId: upperCertId },
      select: { pdfUrl: true, isRevoked: true, recipientId: true },
    });
  } catch (error) {
    logger.error('Certificate download DB lookup failed', { certId, error });
    return res.status(500).json({ error: 'Internal server error.' });
  }

  if (!cert) return res.status(404).json({ error: 'Certificate not found.' });
  if (cert.isRevoked) return res.status(403).json({ error: 'Certificate has been revoked.' });

  // Access check: ADMIN can download any; USER can only download their own
  const isAdmin = ['ADMIN', 'CORE_MEMBER'].includes(authUser.role);
  const isOwner = cert.recipientId && cert.recipientId === authUser.id;
  if (!isAdmin && !isOwner) {
    return res.status(403).json({ error: 'You are not authorised to download this certificate.' });
  }

  const filename = `${upperCertId}.pdf`;
  const localPath = path.join(LOCAL_CERT_DIR, filename);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  // Serve from local disk if available
  if (fs.existsSync(localPath)) {
    return res.sendFile(localPath);
  }

  if (!cert.pdfUrl) {
    return res.status(404).json({ error: 'No PDF available for this certificate.' });
  }

  // Proxy from Cloudinary (or wherever pdfUrl points)
  try {
    const upstream = await fetch(cert.pdfUrl);
    if (!upstream.ok) {
      return res.status(502).json({ error: 'Failed to fetch PDF from storage.' });
    }
    const reader = upstream.body?.getReader();
    if (!reader) {
      return res.status(502).json({ error: 'Empty response from storage.' });
    }
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) { res.end(); return; }
      res.write(value);
      await pump();
    };
    await pump();
  } catch (error) {
    logger.error('Certificate download proxy failed', { certId, error });
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error.' });
    }
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
    signatoryName, facultyName, description, sendEmail,
  } = validation.data;

  try {
    // Generate unique cert ID, retry on collision (extremely rare)
    let certId = generateCertId();
    let attempts = 0;
    while (attempts < 5 && await prisma.certificate.findUnique({ where: { certId } })) {
      certId = generateCertId();
      attempts++;
    }

    // Generate PDF
    const pdfBuffer = await generateCertificatePDF({
      recipientName,
      eventName,
      type,
      position: position ?? undefined,
      domain: domain ?? undefined,
      description: description ?? undefined,
      certId,
      issuedAt: new Date(),
      signatoryName,
      facultyName: facultyName ?? undefined,
      template,
      codescrietLogoUrl: CODESCRIET_LOGO,
      ccsuLogoUrl: CCSU_LOGO,
    });

    // Upload to storage
    const pdfUrl = await uploadCertificate(certId, pdfBuffer);

    // Persist to database
    const certificate = await prisma.certificate.create({
      data: {
        certId,
        recipientName,
        recipientEmail,
        recipientId: recipientId || null,
        eventId: eventId || null,
        eventName,
        type: type.toUpperCase() as CertType,
        position: position || null,
        domain: domain || null,
        template,
        pdfUrl,
        issuedBy: authUser.id,
      },
    });

    // Optionally send email
    if (sendEmail) {
      emailService.sendCertificateIssued(recipientEmail, recipientName, eventName, certId, pdfUrl)
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

    return ApiResponse.success(res, {
      certId: certificate.certId,
      pdfUrl,
      verifyUrl: `https://codescriet.dev/verify/${certId}`,
    }, 'Certificate generated successfully');
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Certificate generation failed', { message: err?.message, stack: err?.stack });
    console.error('[CERT ERROR]', err?.message, err?.stack);
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

  const { recipients, eventId, eventName, type, template, signatoryName, facultyName, description, sendEmail } = validation.data;

  const successes: Array<{ certId: string; pdfUrl: string; name: string; email: string }> = [];
  const failures: Array<{ name: string; email: string; reason: string }> = [];

  // Process in batches of 5 to limit memory/concurrency
  const BATCH_SIZE = 5;
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (r) => {
        try {
          const certId = generateCertId();
          const pdfBuffer = await generateCertificatePDF({
            recipientName: r.name,
            eventName,
            type,
            position: r.position ?? undefined,
            description: description ?? undefined,
            certId,
            issuedAt: new Date(),
            signatoryName,
            facultyName: facultyName ?? undefined,
            template,
            codescrietLogoUrl: CODESCRIET_LOGO,
            ccsuLogoUrl: CCSU_LOGO,
          });

          const pdfUrl = await uploadCertificate(certId, pdfBuffer);

          await prisma.certificate.create({
            data: {
              certId,
              recipientName: r.name,
              recipientEmail: r.email,
              recipientId: r.userId || null,
              eventId: eventId || null,
              eventName,
              type: type.toUpperCase() as CertType,
              position: r.position || null,
              template,
              pdfUrl,
              issuedBy: authUser.id,
            },
          });

          if (sendEmail) {
            emailService.sendCertificateIssued(r.email, r.name, eventName, certId, pdfUrl)
              .then(async (sent) => {
                if (sent) {
                  await prisma.certificate.update({
                    where: { certId },
                    data: { emailSent: true, emailSentAt: new Date() },
                  });
                }
              })
              .catch(() => {});
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

  return ApiResponse.success(res, {
    generated: successes.length,
    failed: failures.length,
    results: successes,
    errors: failures,
  }, `Generated ${successes.length}/${recipients.length} certificates`);
});

// ──────────────────────────────────────────────────────────────────
// PUBLIC: Verify a certificate (no auth required)
// GET /api/certificates/verify/:certId
// ──────────────────────────────────────────────────────────────────
certificatesRouter.get('/verify/:certId', async (req: Request, res: Response) => {
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

    return res.status(200).json({ valid: true, ...cert });
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
    const certificates = await prisma.certificate.findMany({
      where: {
        OR: [
          { recipientId: authUser.id },
          { recipientEmail: authUser.email },
        ],
        isRevoked: false,
      },
      orderBy: { issuedAt: 'desc' },
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
    });

    return ApiResponse.success(res, { certificates });
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
  const { certId } = req.params;

  const validation = revokeSchema.safeParse(req.body);
  if (!validation.success) {
    return ApiResponse.badRequest(res, validation.error.errors[0].message);
  }

  try {
    const cert = await prisma.certificate.findUnique({ where: { certId } });
    if (!cert) {
      return ApiResponse.error(res, { code: ErrorCodes.NOT_FOUND, message: 'Certificate not found', status: 404 });
    }
    if (cert.isRevoked) {
      return ApiResponse.badRequest(res, 'Certificate is already revoked');
    }

    await prisma.certificate.update({
      where: { certId },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedBy: authUser.id,
        revokedReason: validation.data.reason || 'Revoked by admin',
      },
    });

    logger.info('Certificate revoked', { certId, revokedBy: authUser.id });
    return ApiResponse.success(res, { certId }, 'Certificate revoked');
  } catch (error) {
    logger.error('Failed to revoke certificate', { certId, error });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to revoke certificate', status: 500 });
  }
});

// ──────────────────────────────────────────────────────────────────
// PRIVATE: Admin resend certificate email
// POST /api/certificates/:certId/resend
// ──────────────────────────────────────────────────────────────────
certificatesRouter.post('/:certId/resend', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { certId } = req.params;

  try {
    const cert = await prisma.certificate.findUnique({ where: { certId } });
    if (!cert) {
      return ApiResponse.error(res, { code: ErrorCodes.NOT_FOUND, message: 'Certificate not found', status: 404 });
    }
    if (!cert.pdfUrl) {
      return ApiResponse.badRequest(res, 'Certificate has no PDF URL');
    }
    if (cert.isRevoked) {
      return ApiResponse.badRequest(res, 'Cannot resend a revoked certificate');
    }

    const sent = await emailService.sendCertificateIssued(
      cert.recipientEmail,
      cert.recipientName,
      cert.eventName,
      cert.certId,
      cert.pdfUrl,
    );

    if (sent) {
      await prisma.certificate.update({
        where: { certId },
        data: { emailSent: true, emailSentAt: new Date() },
      });
    }

    return ApiResponse.success(res, { sent }, sent ? 'Email sent' : 'Email service not configured');
  } catch (error) {
    logger.error('Failed to resend certificate email', { certId, error });
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
    const cert = await prisma.certificate.findUnique({ where: { certId: certId.toUpperCase() } });
    if (!cert) {
      return ApiResponse.error(res, { code: ErrorCodes.NOT_FOUND, message: 'Certificate not found', status: 404 });
    }
    return ApiResponse.success(res, cert);
  } catch (error) {
    logger.error('Failed to get certificate', { certId, error });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to fetch certificate', status: 500 });
  }
});
