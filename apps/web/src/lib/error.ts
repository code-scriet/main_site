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
