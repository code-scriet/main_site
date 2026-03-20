import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ApiResponse, ErrorCodes } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { sanitizeText } from '../utils/sanitize.js';
import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary.js';

export const signatoriesRouter = Router();

// ── Constants ────────────────────────────────────────────────────────────────

// Max signature image size: 2MB → base64 ≈ 2.67MB (base64 is ~4/3 larger)
const MAX_SIGNATURE_BASE64_LENGTH = 3_000_000; // ~2.25MB file

// ── Zod schemas ──────────────────────────────────────────────────────────────

const createSchema = z.object({
  name:                  z.string().min(2).max(100),
  title:                 z.string().min(2).max(100).default('Club President'),
  signatureImageBase64:  z.string().optional().nullable(), // legacy: base64 data URI
  signatureImageUrl:     z.string().url().optional().nullable(), // preferred: pre-uploaded Cloudinary URL
});

const updateSchema = z.object({
  name:                  z.string().min(2).max(100).optional(),
  title:                 z.string().min(2).max(100).optional(),
  isActive:              z.boolean().optional(),
  signatureImageBase64:  z.string().optional().nullable(), // null = remove existing signature
  signatureImageUrl:     z.string().url().optional().nullable(), // preferred: pre-uploaded Cloudinary URL
});

// ── Cloudinary upload helper ─────────────────────────────────────────────────

async function uploadSignatureImage(id: string, base64DataUri: string): Promise<string> {
  if (isCloudinaryConfigured) {
    const result = await cloudinary.uploader.upload(base64DataUri, {
      public_id: `signatories/sig-${id}`,
      resource_type: 'image',
      overwrite: true,
      format: 'png',
      tags: ['signature'],
    });
    return result.secure_url;
  }
  // Cloudinary not configured — store data URI directly in DB
  logger.warn('Cloudinary not configured — storing signature as data URI in DB', { signatoryId: id });
  return base64DataUri;
}

async function deleteSignatureFromCloudinary(id: string): Promise<void> {
  if (!isCloudinaryConfigured) return;
  try {
    await cloudinary.uploader.destroy(`signatories/sig-${id}`, { resource_type: 'image' });
  } catch {
    // Non-fatal — log but continue
    logger.warn('Failed to delete signature from Cloudinary', { signatoryId: id });
  }
}

// ── GET /api/signatories — list all ─────────────────────────────────────────
signatoriesRouter.get('/', authMiddleware, requireRole('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const signatories = await prisma.signatory.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true, name: true, title: true,
        signatureUrl: true, isActive: true,
        createdAt: true, updatedAt: true,
        _count: {
          select: {
            certificatesAsPrimary: true,
            certificatesAsFaculty: true,
          },
        },
      },
    });
    return ApiResponse.success(res, signatories);
  } catch (error) {
    logger.error('Failed to list signatories', { error });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to fetch signatories', status: 500 });
  }
});

// ── GET /api/signatories/active — active only (for certificate form dropdown) ─
signatoriesRouter.get('/active', authMiddleware, requireRole('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const signatories = await prisma.signatory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, title: true, signatureUrl: true },
    });
    return ApiResponse.success(res, signatories);
  } catch (error) {
    logger.error('Failed to fetch active signatories', { error });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to fetch signatories', status: 500 });
  }
});

// ── POST /api/signatories — create ───────────────────────────────────────────
signatoriesRouter.post('/', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const validation = createSchema.safeParse(req.body);
  if (!validation.success) {
    return ApiResponse.badRequest(res, validation.error.errors[0].message);
  }

  const { name, title, signatureImageBase64, signatureImageUrl } = validation.data;

  // Validate signature image size if base64 provided
  if (signatureImageBase64 && signatureImageBase64.length > MAX_SIGNATURE_BASE64_LENGTH) {
    return ApiResponse.badRequest(res, 'Signature image too large. Maximum size is 2MB.');
  }

  try {
    // Create the record first to get an ID
    const signatory = await prisma.signatory.create({
      data: {
        name: sanitizeText(name),
        title: sanitizeText(title),
      },
    });

    // Apply signature image: prefer pre-uploaded URL over raw base64
    let signatureUrl: string | null = null;
    if (signatureImageUrl) {
      // Frontend already uploaded to Cloudinary — just store the URL
      signatureUrl = signatureImageUrl;
      await prisma.signatory.update({ where: { id: signatory.id }, data: { signatureUrl } });
    } else if (signatureImageBase64) {
      try {
        signatureUrl = await uploadSignatureImage(signatory.id, signatureImageBase64);
        await prisma.signatory.update({ where: { id: signatory.id }, data: { signatureUrl } });
      } catch (uploadErr) {
        logger.error('Signature image upload failed', { signatoryId: signatory.id, error: uploadErr });
        // Don't fail the whole request — signatory created, just without image
      }
    }

    logger.info('Signatory created', { id: signatory.id, name: signatory.name });
    res.status(201);
    return ApiResponse.success(res, { ...signatory, signatureUrl }, 'Signatory created');
  } catch (error) {
    logger.error('Failed to create signatory', { error });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to create signatory', status: 500 });
  }
});

// ── PATCH /api/signatories/:id — update ──────────────────────────────────────
signatoriesRouter.patch('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { id } = req.params;

  const validation = updateSchema.safeParse(req.body);
  if (!validation.success) {
    return ApiResponse.badRequest(res, validation.error.errors[0].message);
  }

  const { name, title, isActive, signatureImageBase64, signatureImageUrl } = validation.data;

  // Validate signature image size if base64 provided
  if (signatureImageBase64 && signatureImageBase64.length > MAX_SIGNATURE_BASE64_LENGTH) {
    return ApiResponse.badRequest(res, 'Signature image too large. Maximum size is 2MB.');
  }

  try {
    const existing = await prisma.signatory.findUnique({ where: { id } });
    if (!existing) {
      return ApiResponse.error(res, { code: ErrorCodes.NOT_FOUND, message: 'Signatory not found', status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    if (name !== undefined) updateData.name = sanitizeText(name);
    if (title !== undefined) updateData.title = sanitizeText(title);
    if (isActive !== undefined) updateData.isActive = isActive;

    // Handle signature image update
    if (signatureImageBase64 === null && !signatureImageUrl) {
      // Explicit null base64 = remove signature
      updateData.signatureUrl = null;
      await deleteSignatureFromCloudinary(id);
    } else if (signatureImageUrl) {
      // Frontend pre-uploaded to Cloudinary — store URL directly
      updateData.signatureUrl = signatureImageUrl;
    } else if (signatureImageBase64) {
      // Legacy: raw base64 upload
      try {
        updateData.signatureUrl = await uploadSignatureImage(id, signatureImageBase64);
      } catch (uploadErr) {
        logger.error('Signature image upload failed during update', { signatoryId: id, error: uploadErr });
        return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to upload signature image', status: 500 });
      }
    }

    const updated = await prisma.signatory.update({
      where: { id },
      data: updateData,
    });

    logger.info('Signatory updated', { id, changes: Object.keys(updateData) });
    return ApiResponse.success(res, updated, 'Signatory updated');
  } catch (error) {
    logger.error('Failed to update signatory', { id, error });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to update signatory', status: 500 });
  }
});

// ── DELETE /api/signatories/:id — delete ─────────────────────────────────────
signatoriesRouter.delete('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const existing = await prisma.signatory.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            certificatesAsPrimary: true,
            certificatesAsFaculty: true,
          },
        },
      },
    });

    if (!existing) {
      return ApiResponse.error(res, { code: ErrorCodes.NOT_FOUND, message: 'Signatory not found', status: 404 });
    }

    const certCount = existing._count.certificatesAsPrimary + existing._count.certificatesAsFaculty;
    if (certCount > 0) {
      // Soft-delete by deactivating instead of hard delete — preserves FK references
      await prisma.signatory.update({ where: { id }, data: { isActive: false } });
      return ApiResponse.success(res, { deactivated: true, certCount }, `Signatory deactivated (referenced by ${certCount} certificate(s))`);
    }

    // Hard delete only if no certificates reference this signatory
    await deleteSignatureFromCloudinary(id);
    await prisma.signatory.delete({ where: { id } });

    logger.info('Signatory deleted', { id });
    return ApiResponse.success(res, null, 'Signatory deleted');
  } catch (error) {
    logger.error('Failed to delete signatory', { id, error });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to delete signatory', status: 500 });
  }
});
