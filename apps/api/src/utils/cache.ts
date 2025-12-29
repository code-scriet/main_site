// In-memory cache with TTL support
import { logger } from './logger.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class Cache {
  private store: Map<string, CacheEntry<unknown>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  // Set a value with TTL in seconds
  set<T>(key: string, value: T, ttlSeconds: number = 300): void {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAt });
    logger.debug('Cache set', { key, ttlSeconds });
  }

  // Get a value from cache
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    logger.debug('Cache hit', { key });
    return entry.value as T;
  }

  // Check if key exists and is not expired
  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    
    return true;
  }

  // Delete a specific key
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  // Delete keys matching a pattern
  deletePattern(pattern: string): number {
    const regex = new RegExp(pattern);
    let deleted = 0;
    
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
        deleted++;
      }
    }
    
    logger.debug('Cache pattern delete', { pattern, deleted });
    return deleted;
  }

  // Clear all cache
  clear(): void {
    this.store.clear();
    logger.info('Cache cleared');
  }

  // Remove expired entries
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.debug('Cache cleanup', { entriesRemoved: cleaned });
    }
  }

  // Get cache stats
  stats(): { size: number; keys: string[] } {
    return {
      size: this.store.size,
      keys: Array.from(this.store.keys()),
    };
  }

  // Get or set pattern - fetch from function if not in cache
  async getOrSet<T>(key: string, fetcher: () => Promise<T>, ttlSeconds: number = 300): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fetcher();
    this.set(key, value, ttlSeconds);
    return value;
  }

  // Destroy the cache (cleanup interval)
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

// Cache keys helpers
export const CacheKeys = {
  settings: () => 'settings:default',
  leaderboard: () => 'leaderboard:qotd',
  publicStats: () => 'stats:public',
  events: (status?: string) => `events:${status || 'all'}`,
  event: (id: string) => `event:${id}`,
  team: () => 'team:all',
  achievements: () => 'achievements:all',
  announcements: (priority?: string) => `announcements:${priority || 'all'}`,
  userProfile: (id: string) => `user:${id}`,
  userRegistrations: (id: string) => `user:${id}:registrations`,
  userStreak: (id: string) => `user:${id}:streak`,
};

// TTL presets in seconds
export const CacheTTL = {
  SHORT: 60,         // 1 minute
  MEDIUM: 300,       // 5 minutes
  LONG: 900,         // 15 minutes
  HOUR: 3600,        // 1 hour
  DAY: 86400,        // 24 hours
};

// Singleton instance
export const cache = new Cache();
