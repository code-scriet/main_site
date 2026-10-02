/**
 * Pulls server-side per-field validation errors out of an API error payload
 * into a `{ [field]: message }` map that forms can render inline next to the
 * matching input. Reads `error.details: { field, message }[]` — the shape
 * emitted by `ApiResponse.validationError()` and the registration custom-field
 * validators. Returns `{}` when the payload carries no field-level detail, so
 * callers can fall back to a single banner/toast message.
 */
export function extractFieldErrors(payload: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!payload || typeof payload !== 'object') {
    return result;
  }

  const { error } = payload as { error?: unknown };
  if (!error || typeof error !== 'object') {
    return result;
  }

  const { details } = error as { details?: unknown };
  if (!Array.isArray(details)) {
    return result;
  }

  for (const entry of details) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const { field, message } = entry as { field?: unknown; message?: unknown };
    if (typeof field === 'string' && field && typeof message === 'string' && message.trim()) {
      // First message per field wins (one inline error per input).
      if (!(field in result)) {
        result[field] = message.trim();
      }
    }
  }

  return result;
}

export function extractApiErrorMessage(
  payload: unknown,
  fallback = 'Something went wrong'
): string {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const maybePayload = payload as {
    error?: unknown;
    message?: unknown;
  };

  if (typeof maybePayload.error === 'string' && maybePayload.error.trim()) {
    return maybePayload.error;
  }

  if (Array.isArray(maybePayload.error)) {
    const messages = maybePayload.error
      .map((entry) => {
        if (entry && typeof entry === 'object' && 'message' in entry) {
          const maybeMessage = (entry as { message?: unknown }).message;
          if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
            return maybeMessage.trim();
          }
        }
        return null;
      })
      .filter((value): value is string => Boolean(value));

    if (messages.length > 0) {
      return messages.join(', ');
    }
  }

  if (maybePayload.error && typeof maybePayload.error === 'object') {
    const nested = maybePayload.error as { message?: unknown; details?: unknown };
    if (typeof nested.message === 'string' && nested.message.trim()) {
      return nested.message;
    }

    if (Array.isArray(nested.details)) {
      const detailMessages = nested.details
        .map((entry) => {
          if (entry && typeof entry === 'object' && 'message' in entry) {
            const maybeMessage = (entry as { message?: unknown }).message;
            if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
              return maybeMessage.trim();
            }
          }
          return null;
        })
        .filter((value): value is string => Boolean(value));

      if (detailMessages.length > 0) {
        return detailMessages.join(', ');
      }
    }
  }

  if (typeof maybePayload.message === 'string' && maybePayload.message.trim()) {
    return maybePayload.message;
  }

  return fallback;
}
