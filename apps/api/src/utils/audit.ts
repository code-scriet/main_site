import { prisma } from '../lib/prisma.js';
import { logger } from './logger.js';

const MAX_ACTION_LENGTH = 120;
const MAX_ENTITY_LENGTH = 120;
const MAX_ENTITY_ID_LENGTH = 191;
const MAX_METADATA_BYTES = 50_000;

function clamp(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function sanitizeMetadata(metadata?: object): object | undefined {
  if (!metadata) {
    return undefined;
  }

  try {
    const json = JSON.stringify(metadata);
    if (Buffer.byteLength(json, 'utf8') <= MAX_METADATA_BYTES) {
      return metadata;
    }

    return { truncated: true, reason: 'metadata_too_large' };
  } catch {
    return { truncated: true, reason: 'metadata_not_serializable' };
  }
}

export const auditLog = async (
  userId: string,
  action: string,
  entity: string,
  entityId?: string,
  metadata?: object
) => {
  if (!userId?.trim()) {
    logger.warn('Skipped audit log with empty userId', { action, entity });
    return;
  }

  const payload = {
    userId,
    action: clamp(action || 'UNKNOWN', MAX_ACTION_LENGTH),
    entity: clamp(entity || 'unknown', MAX_ENTITY_LENGTH),
    entityId: entityId ? clamp(entityId, MAX_ENTITY_ID_LENGTH) : undefined,
    metadata: sanitizeMetadata(metadata),
  };

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await prisma.auditLog.create({ data: payload });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === 3) {
        logger.error('Failed to create audit log after retries', {
          error: message,
          action: payload.action,
          entity: payload.entity,
        });
        return;
      }

      logger.warn('Audit log write failed, retrying', {
        attempt,
        action: payload.action,
        entity: payload.entity,
        error: message,
      });

      await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
    }
  }
};
