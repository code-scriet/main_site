import sharp from 'sharp';
import { logger } from './logger.js';

/**
 * Processes a signature image for clean rendering on certificates.
 *
 * Pipeline:
 *   1. Fetch the image (URL or base64 data URI)
 *   2. Auto-correct EXIF orientation (handles rotated phone photos)
 *   3. Convert to grayscale
 *   4. Detect dark backgrounds and auto-invert if needed
 *   5. Smooth alpha ramp: ink → opaque, background → transparent (preserves anti-aliasing)
 *   6. Trim transparent edges, resize to fit signature area (max 600×200 px)
 *   7. Return as a base64 PNG data URI
 *
 * If the full pipeline fails, attempts a raw-resize fallback (no background removal).
 * Returns `undefined` only if the image cannot be read at all.
 */
const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB
const SHARP_TIMEOUT_MS = 15_000; // 15 seconds — prevents hanging on corrupted images
const ALLOWED_SIGNATURE_IMAGE_HOSTS = new Set(['res.cloudinary.com']);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Sharp processing timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function runSharpPipeline(inputBuffer: Buffer): Promise<string> {
  // ── Pass 1: EXIF rotation + grayscale ──
  const normalized = await sharp(inputBuffer)
    .rotate()                    // auto-correct EXIF orientation (reads Orientation tag)
    .grayscale()                 // single-channel grayscale
    .png()
    .toBuffer();

  // ── Adaptive analysis: detect dark backgrounds + compute threshold ──
  const { channels } = await sharp(normalized).stats();
  const meanLuminance = channels[0].mean;

  // If mean < 100, majority of pixels are dark → light ink on dark paper
  const isDarkBg = meanLuminance < 100;

  // Adaptive threshold: 65% of mean separates ink from background.
  // Clamped to [100, 200] to avoid degenerate values on extreme images.
  const adaptiveThreshold = Math.round(
    Math.min(200, Math.max(100, meanLuminance * 0.65)),
  );

  // ── Pass 2: Conditional invert (dark bg) ──
  const forAlpha = isDarkBg
    ? await sharp(normalized).negate().png().toBuffer()
    : normalized;

  // ── Pass 3: Smooth alpha ramp — ink opaque, background transparent ──
  const { data, info } = await sharp(forAlpha)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels: ch } = info;
  const pixels = new Uint8Array(data.buffer, data.byteOffset, data.length);

  const transitionZone = adaptiveThreshold * 0.4;

  for (let i = 0; i < width * height; i++) {
    const offset = i * ch;
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    if (lum > adaptiveThreshold) {
      pixels[offset + 3] = 0;
    } else {
      const alpha = Math.round(
        255 * Math.min(1, (adaptiveThreshold - lum) / transitionZone),
      );
      pixels[offset + 3] = alpha;
      pixels[offset] = 0;
      pixels[offset + 1] = 0;
      pixels[offset + 2] = 0;
    }
  }

  // ── Pass 4: Reconstruct PNG, trim transparent edges, resize ──
  const finalBuffer = await sharp(
    Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength),
    { raw: { width, height, channels: ch } },
  )
    .trim()
    .resize({
      width: 1200,
      height: 400,
      fit: 'inside',
    })
    .sharpen({ sigma: 1.0, m1: 0.5, m2: 2 })
    .png()
    .toBuffer();

  return `data:image/png;base64,${finalBuffer.toString('base64')}`;
}

export async function processSignatureImage(
  imageSource: string,
): Promise<string | undefined> {
  let inputBuffer: Buffer | undefined;

  try {
    inputBuffer = await resolveImageToBuffer(imageSource);
    if (!inputBuffer || inputBuffer.length === 0) {
      return undefined;
    }

    if (inputBuffer.length > MAX_INPUT_BYTES) {
      logger.warn('Signature image too large, skipping processing', {
        bytes: inputBuffer.length,
        maxBytes: MAX_INPUT_BYTES,
      });
      return undefined;
    }

    return await withTimeout(runSharpPipeline(inputBuffer), SHARP_TIMEOUT_MS);
  } catch (err) {
    logger.warn('Signature processing pipeline failed — attempting raw passthrough', {
      error: err instanceof Error ? err.message : String(err),
    });

    // Fallback: just resize the raw input without any processing.
    // This preserves the original image (no background removal) but at least renders something.
    if (inputBuffer && inputBuffer.length > 0) {
      try {
        const fallback = await withTimeout(
          sharp(inputBuffer)
            .rotate()
            .resize({ width: 1200, height: 400, fit: 'inside' })
            .png()
            .toBuffer(),
          SHARP_TIMEOUT_MS,
        );
        return `data:image/png;base64,${fallback.toString('base64')}`;
      } catch {
        // Even raw passthrough failed or timed out — truly broken image
      }
    }

    return undefined;
  }
}

/** Resolve a URL or base64 data URI string into a raw Buffer. */
async function resolveImageToBuffer(source: string): Promise<Buffer | undefined> {
  // Base64 data URI
  if (source.startsWith('data:')) {
    const match = source.match(/^data:[^;]+;base64,(.+)$/);
    if (!match) return undefined;
    return Buffer.from(match[1], 'base64');
  }

  // HTTP(S) URL — fetch the image
  if (source.startsWith('http://') || source.startsWith('https://')) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(source);
    } catch {
      return undefined;
    }

    if (
      parsedUrl.protocol !== 'https:' ||
      !ALLOWED_SIGNATURE_IMAGE_HOSTS.has(parsedUrl.hostname)
    ) {
      logger.warn('Blocked signature image URL outside allowed hosts', {
        url: source,
        hostname: parsedUrl.hostname,
      });
      return undefined;
    }

    const response = await fetch(parsedUrl, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      logger.warn('Failed to fetch signature image', { url: source, status: response.status });
      return undefined;
    }
    return Buffer.from(await response.arrayBuffer());
  }

  return undefined;
}
