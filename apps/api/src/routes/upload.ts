import { Router, Response } from 'express';
import type { Request } from '../lib/http.js';
import multer from 'multer';
import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ApiResponse, ErrorCodes } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { prisma } from '../lib/prisma.js';

export const uploadRouter = Router();
const CLOUDINARY_PUBLIC_ID_REGEX = /^[a-zA-Z0-9_/-]+$/;

// ISSUE-020: Server-side MIME validation using magic bytes
// Don't trust client-sent mimetype header - validate actual file content
function validateImageMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  
  // Check JPEG
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;
  
  // Check PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;
  
  // Check GIF (GIF87a or GIF89a)
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return true;
  
  // Check WebP (RIFF....WEBP)
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return true;
  
  return false;
}

// Configure multer to use memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

const uploadErrorHandler = (err: unknown, _req: Request, res: Response, next: () => void) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return ApiResponse.error(res, {
      code: ErrorCodes.VALIDATION_ERROR,
      message: 'File too large. Maximum size is 5MB.',
      status: 400,
    });
  }

  if (err instanceof Error) {
    return ApiResponse.error(res, {
      code: ErrorCodes.VALIDATION_ERROR,
      message: err.message,
      status: 400,
    });
  }

  next();
};

/**
 * Upload image to Cloudinary
 * POST /api/upload/image
 * Body: multipart/form-data with 'image' field
 * Returns: { url: string, publicId: string }
 */
uploadRouter.post(
  '/image',
  authMiddleware,
  requireRole('CORE_MEMBER'),
  upload.single('image'),
  uploadErrorHandler,
  async (req: Request, res: Response) => {
    try {
      if (!isCloudinaryConfigured) {
        return ApiResponse.error(res, {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Image upload is not configured. Please contact the administrator.',
          status: 503,
        });
      }

      if (!req.file) {
        return ApiResponse.error(res, {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'No image file provided',
          status: 400,
        });
      }

      // ISSUE-020: Validate file content using magic bytes (don't trust client-sent mimetype)
      if (!validateImageMagicBytes(req.file.buffer)) {
        logger.warn('Upload rejected: invalid image magic bytes', {
          claimedMimetype: req.file.mimetype,
          filename: req.file.originalname,
        });
        return ApiResponse.error(res, {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Invalid image file. Only JPEG, PNG, GIF, and WebP are allowed.',
          status: 400,
        });
      }

      const authUser = getAuthUser(req)!;

      // Upload to Cloudinary
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'club-events', // Store in 'club-events' folder in Cloudinary
          resource_type: 'image',
          transformation: [
            { width: 2000, crop: 'limit' }, // Max width 2000px
            { quality: 'auto:good' }, // Automatic quality optimization
            { fetch_format: 'auto' }, // Automatic format (WebP if supported)
          ],
        },
        async (error, result) => {
          if (error) {
            logger.error('Cloudinary upload error:', { error: error instanceof Error ? error.message : String(error) });
            return ApiResponse.error(res, {
              code: ErrorCodes.INTERNAL_ERROR,
              message: 'Failed to upload image',
              status: 500,
            });
          }

          if (!result) {
            return ApiResponse.error(res, {
              code: ErrorCodes.INTERNAL_ERROR,
              message: 'Upload failed - no result',
              status: 500,
            });
          }

          // No server-side persistence by design: the image library is owned by
          // the client (localStorage on the uploader's browser), so no image link
          // is recorded in the database. We hand back the Cloudinary URL plus the
          // metadata the client needs to render its local gallery (size/dimensions/
          // format). The Cloudinary asset itself is the only durable artefact.
          res.status(201);
          ApiResponse.success(res, {
            url: result.secure_url,
            publicId: result.public_id,
            bytes: result.bytes ?? req.file?.buffer?.length ?? null,
            width: result.width ?? null,
            height: result.height ?? null,
            format: result.format ?? null,
            filename: req.file?.originalname ?? null,
            uploadedBy: authUser.id,
          }, 'Image uploaded successfully');
        }
      );

      // Pipe the file buffer to Cloudinary
      uploadStream.end(req.file.buffer);
    } catch (error) {
      logger.error('Upload error:', { error: error instanceof Error ? error.message : String(error) });
      ApiResponse.error(res, {
        code: ErrorCodes.INTERNAL_ERROR,
        message: error instanceof Error ? error.message : 'Failed to upload image',
        status: 500,
      });
    }
  }
);

/**
 * Upload a streak-share card (S-03).
 * POST /api/upload/streak-card
 *
 * Distinct from /image on purpose: the card lands in a dedicated `streak-cards/`
 * folder and does NOT write an UploadedImage gallery row — it's a transient share
 * asset (the og:image of /share/streak/:id), not a library upload, so it must never
 * appear in the member's upload gallery or inflate counts.uploadedImages. Any
 * authenticated user may upload their OWN card (unlike /image, which is CORE_MEMBER+).
 * The previous card is destroyed by POST /users/me/streak-card when the new URL is
 * persisted, so storage stays ~1 asset per user.
 */
uploadRouter.post(
  '/streak-card',
  authMiddleware,
  upload.single('image'),
  uploadErrorHandler,
  async (req: Request, res: Response) => {
    try {
      if (!isCloudinaryConfigured) {
        return ApiResponse.error(res, {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Image upload is not configured. Please contact the administrator.',
          status: 503,
        });
      }

      if (!req.file) {
        return ApiResponse.error(res, { code: ErrorCodes.VALIDATION_ERROR, message: 'No image file provided', status: 400 });
      }

      // Same magic-byte gate as /image — don't trust the client mimetype.
      if (!validateImageMagicBytes(req.file.buffer)) {
        return ApiResponse.error(res, {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Invalid image file. Only JPEG, PNG, GIF, and WebP are allowed.',
          status: 400,
        });
      }

      const authUser = getAuthUser(req)!;
      const buffer = req.file.buffer;
      const uploaded = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'streak-cards',
            resource_type: 'image',
            // 1200px wide covers the 1200×630 OG target; no fetch_format:auto so
            // crawlers get a stable format regardless of Accept negotiation.
            transformation: [{ width: 1200, crop: 'limit' }, { quality: 'auto:good' }],
          },
          (error, result) => {
            if (error || !result) return reject(error ?? new Error('Upload failed - no result'));
            resolve(result as { secure_url: string; public_id: string });
          },
        );
        stream.end(buffer);
      });

      res.status(201);
      return ApiResponse.success(res, {
        url: uploaded.secure_url,
        publicId: uploaded.public_id,
        uploadedBy: authUser.id,
      }, 'Streak card uploaded successfully');
    } catch (error) {
      logger.error('Streak card upload error:', { error: error instanceof Error ? error.message : String(error) });
      return ApiResponse.error(res, {
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'Failed to upload streak card',
        status: 500,
      });
    }
  }
);

/**
 * Dashboard v2 — list the caller's past uploads for the image-library gallery.
 * GET /api/upload/history?limit=24
 */
uploadRouter.get('/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const auth = getAuthUser(req)!;
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 24));
    const rows = await prisma.uploadedImage.findMany({
      where: { userId: auth.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return ApiResponse.success(res, rows.map(r => ({
      id: r.id,
      url: r.url,
      publicId: r.publicId,
      filename: r.filename,
      bytes: r.bytes,
      width: r.width,
      height: r.height,
      format: r.format,
      createdAt: r.createdAt.toISOString(),
    })));
  } catch (error) {
    logger.error('Failed to load upload history', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to load upload history', status: 500 });
  }
});

/**
 * Delete image from Cloudinary
 * DELETE /api/upload/image/:publicId
 */
uploadRouter.delete(
  '/image/:publicId',
  authMiddleware,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      if (!isCloudinaryConfigured) {
        return ApiResponse.error(res, {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Image management is not configured',
          status: 503,
        });
      }

      const publicId = decodeURIComponent(req.params.publicId);
      if (!CLOUDINARY_PUBLIC_ID_REGEX.test(publicId)) {
        return ApiResponse.error(res, {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Invalid publicId format',
          status: 400,
        });
      }

      // Delete from Cloudinary
      const result = await cloudinary.uploader.destroy(publicId);

      if (result.result === 'ok') {
        // Cleanup the library record. Awaited so failures are visible — the
        // Cloudinary asset is already gone, so a hanging DB row would otherwise
        // resurface in the gallery as a broken thumbnail.
        try {
          await prisma.uploadedImage.deleteMany({ where: { publicId } });
        } catch (dbErr) {
          logger.error('Failed to delete uploaded_image record after Cloudinary delete', {
            publicId,
            error: dbErr instanceof Error ? dbErr.message : String(dbErr),
          });
        }
        ApiResponse.success(res, { deleted: true }, 'Image deleted successfully');
      } else {
        ApiResponse.error(res, {
          code: ErrorCodes.NOT_FOUND,
          message: 'Image not found or already deleted',
          status: 404,
        });
      }
    } catch (error) {
      logger.error('Delete error:', { error: error instanceof Error ? error.message : String(error) });
      ApiResponse.error(res, {
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'Failed to delete image',
        status: 500,
      });
    }
  }
);
