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

  if (maybePayload.error && typeof maybePayload.error === 'object') {
    const nested = maybePayload.error as { message?: unknown };
    if (typeof nested.message === 'string' && nested.message.trim()) {
      return nested.message;
    }
  }

  if (typeof maybePayload.message === 'string' && maybePayload.message.trim()) {
    return maybePayload.message;
  }

  return fallback;
}
