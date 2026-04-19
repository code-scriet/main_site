const FILLED_STAR = '\u2605';
const EMPTY_STAR = '\u2606';

export const DEFAULT_MAX_RATING = 5;

export function parseRatingValue(
  value: string | number | null | undefined,
  maxRating = DEFAULT_MAX_RATING,
): number | null {
  if (value == null) return null;

  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(numeric)) return null;

  const normalized = Math.round(numeric);
  if (normalized < 1 || normalized > maxRating) return null;

  return normalized;
}

export function formatRatingStars(
  value: string | number | null | undefined,
  maxRating = DEFAULT_MAX_RATING,
): string {
  const parsed = parseRatingValue(value, maxRating);
  if (!parsed) return value == null ? '' : String(value);

  return `${FILLED_STAR.repeat(parsed)}${EMPTY_STAR.repeat(Math.max(maxRating - parsed, 0))}`;
}

export function formatRatingDisplay(
  value: string | number | null | undefined,
  maxRating = DEFAULT_MAX_RATING,
): string {
  const parsed = parseRatingValue(value, maxRating);
  if (!parsed) return value == null ? '' : String(value);

  return `${formatRatingStars(parsed, maxRating)} (${parsed}/${maxRating})`;
}