import { Router, Request, Response } from 'express';
import multer from 'multer';
import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ApiResponse, ErrorCodes } from '../utils/response.js';
import { logger } from '../utils/logger.js';

export const uploadRouter = Router();

// Configure multer to use memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Accept images only
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
});

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
        (error, result) => {
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

          // Return the Cloudinary URL
          res.status(201);
          ApiResponse.success(res, {
            url: result.secure_url,
            publicId: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
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

      // Delete from Cloudinary
      const result = await cloudinary.uploader.destroy(publicId);

      if (result.result === 'ok') {
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
