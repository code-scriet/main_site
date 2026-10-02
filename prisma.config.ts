import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 config. Connection URLs are no longer allowed in schema.prisma's
 * datasource block, so they live here (for the CLI: migrate/introspect/studio)
 * and in the runtime driver adapter (apps/api/src/lib/prisma.ts → DATABASE_URL,
 * the Neon pooler).
 *
 * Migrate uses DIRECT_URL (the non-pooler connection) to avoid P1002 advisory-lock
 * errors on the pooled connection — preserving the prior schema's `directUrl`
 * behavior. The Prisma 7 config `Datasource` has no separate `directUrl` field;
 * `url` here IS the migrate/introspect connection.
 *
 * We read `process.env.DIRECT_URL` directly (dotenv is loaded above) rather than
 * Prisma's `env('DIRECT_URL')` helper: the helper resolves EAGERLY and throws
 * `PrismaConfigEnvError` whenever the var is absent — which breaks `prisma generate`
 * (CI, fresh checkouts) even though generate never connects to the DB. The `?? ''`
 * fallback lets generate run url-less; migrate/introspect/studio are only ever run
 * where DIRECT_URL is actually set, so they still get the real non-pooler URL.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_URL ?? '',
  },
});
