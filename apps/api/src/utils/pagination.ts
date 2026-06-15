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
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return null;
  }

  return parsed;
};
