import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary.js';
import { logger } from './logger.js';

function isCloudinaryPlaceholder(): boolean {
  return (
    process.env.CLOUDINARY_CLOUD_NAME === 'your_cloud_name' ||
    process.env.CLOUDINARY_API_KEY === 'your_api_key'
  );
}

/**
 * Uploads a PDF buffer to Cloudinary as a raw file.
 * Returns the secure Cloudinary URL of the uploaded file.
 */
export async function uploadCertificate(certId: string, pdfBuffer: Buffer): Promise<string> {
  if (!isCloudinaryConfigured || isCloudinaryPlaceholder()) {
    throw new Error('Cloudinary is not configured correctly for certificate uploads');
  }

  try {
    const url = await uploadToCloudinary(certId, pdfBuffer);
    logger.info('Certificate uploaded to Cloudinary', { certId });
    return url;
  } catch (err: unknown) {
    logger.error('Cloudinary upload failed for certificate', {
      certId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err instanceof Error ? err : new Error('Certificate upload failed');
  }
}

function uploadToCloudinary(certId: string, pdfBuffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: `certificates/${certId}`,
        resource_type: 'raw',
        format: 'pdf',
        tags: ['certificate'],
        overwrite: false,
      },
      (error, result) => {
        if (error) {
          logger.error('Cloudinary certificate upload failed', { certId, error: error.message });
          return reject(new Error(error.message));
        }
        if (!result?.secure_url) {
          return reject(new Error('Cloudinary returned no URL'));
        }
        resolve(result.secure_url);
      },
    );
    uploadStream.end(pdfBuffer);
  });
}
