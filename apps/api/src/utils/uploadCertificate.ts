import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary.js';
import { logger } from './logger.js';

/**
 * Uploads a PDF buffer to Cloudinary as a raw file.
 * Returns the public URL of the uploaded file.
 *
 * Set up R2/S3 alternative: replace this function body with @aws-sdk/client-s3
 * when R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME,
 * and R2_PUBLIC_URL are defined in your environment.
 */
export async function uploadCertificate(certId: string, pdfBuffer: Buffer): Promise<string> {
  // Prefer R2 if configured
  if (
    process.env.R2_ENDPOINT &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL
  ) {
    return uploadToR2(certId, pdfBuffer);
  }

  // Fallback to Cloudinary (already configured in this codebase)
  return uploadToCloudinary(certId, pdfBuffer);
}

async function uploadToR2(certId: string, pdfBuffer: Buffer): Promise<string> {
  // Dynamic import to avoid requiring the package when not using R2
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { S3Client, PutObjectCommand } = await (Function('return import("@aws-sdk/client-s3")')() as Promise<any>);

  const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  const key = `certificates/${certId}.pdf`;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    Body: pdfBuffer,
    ContentType: 'application/pdf',
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

function uploadToCloudinary(certId: string, pdfBuffer: Buffer): Promise<string> {
  if (!isCloudinaryConfigured) {
    throw new Error('Neither R2 nor Cloudinary is configured. Set CLOUDINARY_* or R2_* env vars.');
  }

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
