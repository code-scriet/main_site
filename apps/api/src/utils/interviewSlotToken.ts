import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from '../lib/prisma.js';

export const SLOT_TOKEN_BYTES = 32;
export const SLOT_TOKEN_EXPIRY_DAYS = 7;

/** 32 random bytes hex (64 chars). The raw value is never stored. */
export function generateRawSlotToken(): string {
  return randomBytes(SLOT_TOKEN_BYTES).toString('hex');
}

/** SHA-256 hex of the opaque token — what is persisted. */
export function hashSlotToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function slotTokenExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + SLOT_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}

/** timingSafeEqual over hex-hash buffers; length mismatch → false (caller maps to 401). */
export function hashesEqualTimingSafe(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, 'utf8');
  const b = Buffer.from(bHex, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export class SlotTokenError extends Error {
  status: number;
  code: 'unauthorized' | 'expired' | 'not_found';

  constructor(status: number, code: 'unauthorized' | 'expired' | 'not_found', message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type TokenDb = {
  interviewSlotToken: {
    upsert(args: {
      where: { applicationId: string };
      create: { applicationId: string; tokenHash: string; expiresAt: Date };
      update: { tokenHash: string; expiresAt: Date };
    }): Promise<{ tokenHash: string; expiresAt: Date; applicationId: string }>;
  };
};

/**
 * Create (or replace) the magic-link token for an application.
 * Stores only the SHA-256 hash; returns the raw token for the magic link.
 */
export async function issueSlotToken(
  applicationId: string,
  db: TokenDb = prisma as unknown as TokenDb,
): Promise<string> {
  const raw = generateRawSlotToken();
  const tokenHash = hashSlotToken(raw);
  const expiresAt = slotTokenExpiry();
  await db.interviewSlotToken.upsert({
    where: { applicationId },
    create: { applicationId, tokenHash, expiresAt },
    update: { tokenHash, expiresAt },
  });
  return raw;
}

/** Revoke (delete) the token for an application — used on REJECT. */
export async function revokeSlotToken(applicationId: string): Promise<void> {
  await prisma.interviewSlotToken.deleteMany({ where: { applicationId } }).catch(() => undefined);
}

export interface ResolvedSlotToken {
  application: {
    id: string;
    name: string;
    email: string;
    applyingRole: string;
    status: string;
    cycle: string;
    userId: string | null;
  };
}

/**
 * Resolve an incoming raw token to its application ONLY.
 * Wrong/missing → 401; expired → 410. Uses timingSafeEqual on the hashes.
 */
export async function resolveSlotToken(rawToken: string): Promise<ResolvedSlotToken> {
  if (typeof rawToken !== 'string' || rawToken.length === 0) {
    throw new SlotTokenError(401, 'unauthorized', 'Invalid slot token');
  }
  const incomingHash = hashSlotToken(rawToken);
  const row = await prisma.interviewSlotToken.findUnique({
    where: { tokenHash: incomingHash },
  }).catch(() => null) as unknown as { applicationId: string; tokenHash: string; expiresAt: Date } | null;

  if (!row) {
    throw new SlotTokenError(401, 'unauthorized', 'Invalid slot token');
  }
  if (!hashesEqualTimingSafe(incomingHash, row.tokenHash)) {
    throw new SlotTokenError(401, 'unauthorized', 'Invalid slot token');
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    throw new SlotTokenError(410, 'expired', 'Slot token has expired');
  }
  const application = await prisma.hiringApplication.findUnique({
    where: { id: row.applicationId },
  }).catch(() => null) as unknown as ResolvedSlotToken['application'] | null;
  if (!application) {
    throw new SlotTokenError(401, 'unauthorized', 'Invalid slot token');
  }
  return { application };
}
