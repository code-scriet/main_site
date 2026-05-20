import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

// Shared retry harness for Serializable transactions.
//
// Postgres throws P2034 when a Serializable transaction conflicts with a
// concurrent one. The right answer is almost always "retry a few times with
// jittered exponential backoff." Doing that inline in every router smears
// the policy across many files and makes it easy to forget. This helper
// centralizes the retry contract so callers describe only the work.
//
// Defaults match the existing pattern used in registrations / invitations /
// teams: 3 attempts, 50ms base delay, full jitter (50ms * 2^attempt + rand).
// All non-P2034 errors propagate immediately so the caller can map them
// (P2002 unique-violation, custom HTTP errors, etc.).

export interface SerializableTxOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  jitter?: boolean;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 50;

export const isSerializationConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';

export async function executeSerializableTransaction<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options: SerializableTxOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const useJitter = options.jitter ?? true;

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      lastError = error;
      if (!isSerializationConflict(error) || attempt >= maxAttempts - 1) {
        throw error;
      }
      const delayBase = baseDelayMs * Math.pow(2, attempt);
      const delay = useJitter ? delayBase + Math.random() * delayBase : delayBase;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  // Unreachable; the final attempt above either returns or throws.
  throw lastError;
}
