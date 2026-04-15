const TOKEN_STORAGE_KEY = 'token';

function safeGet(storage: Storage): string | null {
  try {
    return storage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeSet(storage: Storage, value: string): void {
  try {
    storage.setItem(TOKEN_STORAGE_KEY, value);
  } catch {
    // Ignore storage write failures (private mode / blocked storage).
  }
}

function safeRemove(storage: Storage): void {
  try {
    storage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function getStoredAuthToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const sessionToken = safeGet(window.sessionStorage);
  if (sessionToken) {
    return sessionToken;
  }

  // Fallback to persistent localStorage token and mirror to sessionStorage
  // so auth survives reloads and reopened tabs.
  const persistentToken = safeGet(window.localStorage);
  if (persistentToken) {
    safeSet(window.sessionStorage, persistentToken);
    return persistentToken;
  }

  return null;
}

export function storeAuthToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  safeSet(window.sessionStorage, token);
  safeSet(window.localStorage, token);
}

export function clearStoredAuthToken(): void {
  if (typeof window === 'undefined') {
    return;
  }

  safeRemove(window.sessionStorage);
  safeRemove(window.localStorage);
}
