import 'dotenv/config';
import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

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
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DIRECT_URL'),
  },
});
