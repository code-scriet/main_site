/**
 * Narrow an Express `req.query.<key>` value to a single string.
 *
 * Express parses repeated params (`?x=a&x=b`) into arrays at runtime, so an
 * unguarded `as string` cast can hand an array straight to Prisma (`contains`
 * / equality filters) and trigger a `PrismaClientValidationError` → 500.
 * Returns the trailing string for an array, the string itself, or undefined.
 */
export const getQueryString = (input: unknown): string | undefined => {
  if (typeof input === 'string') {
    return input;
  }
  if (Array.isArray(input)) {
    const last = input[input.length - 1];
    return typeof last === 'string' ? last : undefined;
  }
  return undefined;
};

export const parsePaginationNumber = (
  input: unknown,
  fallback: number,
  { min, max }: { min: number; max: number }
): number | null => {
  if (input === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(String(input), 10);
  // Only genuinely malformed (non-integer) input is rejected (callers turn the
  // null into a 400). An out-of-range BUT numeric value is CLAMPED to [min, max]
  // instead of rejected: over-asking should return the max page, not break the
  // request. This keeps the query bounded (free-tier safe) while staying
  // forgiving — the old null→400 on `limit=200` against a max-100 endpoint
  // silently emptied admin list pages (e.g. /admin/achievements) after the
  // query-bounding perf change.
  if (!Number.isInteger(parsed)) {
    return null;
  }

  return Math.min(max, Math.max(min, parsed));
};
