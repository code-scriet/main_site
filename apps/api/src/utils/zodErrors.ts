import type { ZodError } from 'zod';

export interface FieldError {
  field: string;
  message: string;
}

/**
 * Flattens a ZodError into the `{ field, message }[]` shape that
 * `ApiResponse.validationError()` emits as `error.details`. The frontend maps
 * each entry to the matching form input (see `extractFieldErrors` in
 * apps/web/src/lib/error.ts), so the dotted path is used as the field key and
 * only the first issue per field is kept (one inline message per input).
 *
 * Issues with an empty path (whole-object refinements) are keyed as `form` so
 * the client can still surface them somewhere deterministic.
 */
export function zodFieldErrors(error: ZodError): FieldError[] {
  const seen = new Set<string>();
  const result: FieldError[] = [];

  for (const issue of error.errors) {
    const field = issue.path.length > 0 ? issue.path.join('.') : 'form';
    if (seen.has(field)) {
      continue;
    }
    seen.add(field);
    result.push({ field, message: issue.message });
  }

  return result;
}
