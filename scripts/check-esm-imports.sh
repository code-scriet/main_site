#!/usr/bin/env bash
# Fails if any internal relative import in apps/api/src/ is missing the .js extension.
#
# Node 20 ESM (api package, "type": "module") requires explicit .js suffixes on
# relative imports — a missing suffix fails at runtime with ERR_MODULE_NOT_FOUND.
# TypeScript rewrites the import target to .js at build time, but the source
# must declare the suffix.
#
# Scope: only apps/api/src/. apps/web and apps/playground use Vite, which does
# not require the suffix and would produce false positives.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/apps/api/src"

if [ ! -d "$TARGET" ]; then
  echo "apps/api/src not found at $TARGET"
  exit 1
fi

# Find internal relative imports (./ or ../) lacking a .js or .json suffix.
# Filter out: type-only imports against external packages, prisma, node:* builtins.
hits="$(
  grep -rEn "from '(\.\./|\./)[^']*'" "$TARGET" \
    --include='*.ts' --include='*.mts' --include='*.cts' \
  | grep -v "\.js'" \
  | grep -v "\.json'" \
  || true
)"

if [ -n "$hits" ]; then
  echo "Missing .js extension on internal relative imports in apps/api/src/:"
  echo "$hits"
  echo
  echo "Node 20 ESM requires .js on relative imports (TypeScript source declares the post-build .js suffix)."
  exit 1
fi

echo "OK: 0 ESM import violations in apps/api/src/."
