import { customAlphabet } from 'nanoid';

// No 0/O or 1/I to avoid visual confusion when reading printed certificates
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const segment = customAlphabet(alphabet, 4);

/**
 * Generates a human-readable 12-character certificate ID.
 * Format: XXXX-XXXX-XXXX (e.g. "ABCD-EFGH-IJKL")
 */
export function generateCertId(): string {
  return `${segment()}-${segment()}-${segment()}`;
}
