// scripts/generate-indexnow-key.cjs
// Writes <key>.txt into apps/web/public/ at build time so IndexNow can verify
// ownership at https://codescriet.dev/<key>.txt.
// Reads INDEXNOW_KEY from environment. Safe no-op if the var is unset.

const fs = require('fs');
const path = require('path');

const key = (process.env.INDEXNOW_KEY || '').trim();

if (!key) {
  console.log('[generate-indexnow-key] INDEXNOW_KEY not set — skipping.');
  process.exit(0);
}

const publicDir = path.join(__dirname, '..', 'apps', 'web', 'public');
const dest = path.join(publicDir, `${key}.txt`);

fs.writeFileSync(dest, key, 'utf8');
console.log(`[generate-indexnow-key] Wrote ${dest}`);
