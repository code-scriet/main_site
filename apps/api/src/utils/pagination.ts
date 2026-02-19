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
