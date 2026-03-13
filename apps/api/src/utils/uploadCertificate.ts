import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary.js';
import { logger } from './logger.js';
import { buildLegacyCertificateFileUrl } from './publicUrl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_CERT_DIR = path.join(__dirname, '..', '..', 'uploads', 'certificates');

function isCloudinaryPlaceholder(): boolean {
  return (
    process.env.CLOUDINARY_CLOUD_NAME === 'your_cloud_name' ||
    process.env.CLOUDINARY_API_KEY === 'your_api_key'
  );
}

function saveToLocalDisk(certId: string, pdfBuffer: Buffer): string {
  if (!fs.existsSync(LOCAL_CERT_DIR)) {
    fs.mkdirSync(LOCAL_CERT_DIR, { recursive: true });
  }
  const filePath = path.join(LOCAL_CERT_DIR, `${certId}.pdf`);
  fs.writeFileSync(filePath, pdfBuffer);
  return buildLegacyCertificateFileUrl(certId);
}

/**
 * Uploads a PDF buffer to Cloudinary as a raw file.
 * Returns the public URL of the uploaded file.
 *
 * Set up R2/S3 alternative: replace this function body with @aws-sdk/client-s3
 * when R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME,
 * and R2_PUBLIC_URL are defined in your environment.
 */
export async function uploadCertificate(certId: string, pdfBuffer: Buffer): Promise<string> {
  // ALWAYS save a local copy first — this ensures downloads work even when
  // Cloudinary delivery is blocked ("Customer is marked as untrusted").
  // The download endpoint checks local disk first before trying cloud URLs.
  saveToLocalDisk(certId, pdfBuffer);
  logger.info('Certificate saved to local disk', { certId });

  // Prefer R2 if configured
  if (
    process.env.R2_ENDPOINT &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL
  ) {
    try {
      return await uploadToR2(certId, pdfBuffer);
    } catch (err: unknown) {
      logger.warn('R2 upload failed, using local path', { certId, error: err instanceof Error ? err.message : String(err) });
      return buildLegacyCertificateFileUrl(certId);
    }
  }

  // Also upload to Cloudinary as a backup (even though delivery is blocked,
  // it preserves the file for when the user enables PDF delivery later)
  if (isCloudinaryConfigured && !isCloudinaryPlaceholder()) {
    try {
      const url = await uploadToCloudinary(certId, pdfBuffer);
      logger.info('Certificate also uploaded to Cloudinary', { certId });
      return url;
    } catch (err: unknown) {
      logger.warn('Cloudinary upload failed, using local path', { certId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return buildLegacyCertificateFileUrl(certId);
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
