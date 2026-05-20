// Bounded LRU cache for the per-request user lookup done in auth middleware.
//
// Why: every authenticated API request currently does a `prisma.user.findUnique`
// just to revalidate `tokenVersion` and `isDeleted`. On a serverless DB pool,
// that round-trip is the single biggest source of per-request latency. This
// cache lets repeat hits from the same user skip the DB.
//
// TTL is intentionally short (30s) so admin actions — force-logout, role
// change, soft-delete — propagate quickly. Anywhere we mutate a user row,
// `invalidateCachedUser(userId)` MUST be called to drop the entry.

export interface CachedAuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string | null;
  phone?: string | null;
  course?: string | null;
  branch?: string | null;
  year?: string | null;
  profileCompleted?: boolean | null;
  tokenVersion: number;
  isDeleted: boolean;
}

interface Entry {
  user: CachedAuthUser;
  expiresAt: number;
}

const TTL_MS = 30_000;
const MAX_ENTRIES = 500;

// Map insertion order doubles as LRU recency. On access we delete-then-set to
// move the entry to the most-recently-used end.
const cache = new Map<string, Entry>();

export function getCachedAuthUser(userId: string): CachedAuthUser | null {
  const entry = cache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(userId);
    return null;
  }
  cache.delete(userId);
  cache.set(userId, entry);
  return entry.user;
}

export function setCachedAuthUser(user: CachedAuthUser): void {
  if (cache.size >= MAX_ENTRIES && !cache.has(user.id)) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(user.id, { user, expiresAt: Date.now() + TTL_MS });
}

export function invalidateCachedAuthUser(userId: string): void {
  cache.delete(userId);
}

// Test/debug helper.
export function _clearAuthCache(): void {
  cache.clear();
}
