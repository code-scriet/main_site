import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { logger } from '../utils/logger.js';

declare global {
  var prisma: PrismaClient | undefined;
}

// Preserve the frozen client connection cap (HC #1/#3). Prisma's native connector
// read `connection_limit` from DATABASE_URL to size its pool; the node-postgres
// driver adapter does NOT, so it would otherwise default to pg's `max: 10`.
// Derive the cap from the URL (prod uses ?connection_limit=5), falling back to 5
// to stay within the free-tier 512 MB box + Neon pooler limits.
const resolvePoolMax = (): number => {
  try {
    const raw = new URL(process.env.DATABASE_URL ?? '').searchParams.get('connection_limit');
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : 5;
  } catch {
    return 5;
  }
};

// The frozen pool size, resolved once. Exported so callers that fan out many
// independent reads can cap their concurrency BELOW it (leaving a connection
// free for other traffic) instead of hard-coding "5".
export const DB_POOL_MAX = resolvePoolMax();

// Per-statement safety valve (S0). A runaway/cold aggregate would otherwise pin
// one of the (frozen) 5 pool connections indefinitely, starving all other
// requests. `statement_timeout` (ms) is applied at connection establishment via
// the libpq `options` startup parameter, so it covers EVERY pooled connection
// with no per-query wrapping. Fires as Postgres error 57014 (query_canceled) —
// NOT retried by withRetry (intentional: a timeout means the query was too
// slow, not a transient cold start; auto-retrying an 8s burner would triple
// pressure on the frozen pool).
//
// ⚠️ DEFAULT OFF (opt-in) until verified against the REAL Neon pooled endpoint:
// Neon's pooler is PgBouncer, which only accepts startup `options` parameters
// it tracks — `statement_timeout` may be (a) honored, (b) silently stripped
// (valve is a no-op), or (c) REJECTED, which would refuse every pooled
// connection (total outage). Verify with a client constructed exactly like this
// one running `SELECT current_setting('statement_timeout')` against the prod
// DATABASE_URL, then set PG_STATEMENT_TIMEOUT_MS (~8000 to start). Rollback =
// unset/0 + restart. Migrations use DIRECT_URL (separate client) — unaffected.
const resolveStatementTimeoutMs = (): number => {
  const raw = process.env.PG_STATEMENT_TIMEOUT_MS;
  if (raw === undefined || raw === '') return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    // A typo'd value must not look identical to a deliberate opt-out.
    logger.warn('PG_STATEMENT_TIMEOUT_MS is not a number — statement timeout disabled', { raw });
    return 0;
  }
  return Math.floor(parsed);
};

// Configure Prisma with retry logic for Neon serverless cold starts.
// Prisma 7 connects through a driver adapter; PrismaPg uses node-postgres against
// the pooled DATABASE_URL (Neon pooler), matching the prior datasource `url`.
// Migrate/introspect use DIRECT_URL via prisma.config.ts.
const createPrismaClient = () => {
  const statementTimeoutMs = resolveStatementTimeoutMs();
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: resolvePoolMax(),
    // libpq startup option, applied per-connection ONLY where the pooler honors
    // it — Neon's PgBouncer may honor, silently strip, or reject startup options
    // (see the ⚠️ caveat on resolveStatementTimeoutMs above; that unverified
    // behavior is why this is default-off). Omitted entirely when disabled so
    // behavior is byte-identical to before S0.
    ...(statementTimeoutMs > 0 ? { options: `-c statement_timeout=${statementTimeoutMs}` } : {}),
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
};

export const prisma = global.prisma || createPrismaClient();

// Cache client in development to prevent too many connections
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Retry wrapper for database operations (handles Neon cold starts)
// ISSUE-029: Exponential backoff with jitter to prevent thundering herd
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 500
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const code = (error as { code?: string })?.code;
      const message = (error as { message?: string })?.message;
      
      // Only retry on connection timeout errors (P1002, P2024)
      if (code === 'P1002' || code === 'P2024' || message?.includes('timed out')) {
        // Exponential backoff: 500ms, 1000ms, 2000ms + random jitter
        const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
        const jitter = Math.random() * baseDelayMs;
        const delay = exponentialDelay + jitter;
        logger.warn('Database connection retry', { attempt, maxRetries, delayMs: Math.round(delay) });
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  
  throw lastError;
}

// Graceful shutdown handler
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
