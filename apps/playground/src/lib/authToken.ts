const PLAYGROUND_TOKEN_KEY = 'pg_token';
const LEGACY_TOKEN_KEY = 'token';

let legacyTokenMigrated = false;

export function getPlaygroundStoredToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const sessionToken = sessionStorage.getItem(PLAYGROUND_TOKEN_KEY);
  if (sessionToken) {
    return sessionToken;
  }

  // One-time migration from legacy persistent storage to session-only storage.
  if (!legacyTokenMigrated) {
    const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
    if (legacyToken) {
      sessionStorage.setItem(PLAYGROUND_TOKEN_KEY, legacyToken);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      legacyTokenMigrated = true;
      return legacyToken;
    }
    legacyTokenMigrated = true;
  }

  return null;
}

export function storePlaygroundToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  sessionStorage.setItem(PLAYGROUND_TOKEN_KEY, token);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export function clearPlaygroundToken(): void {
  if (typeof window === 'undefined') {
    return;
  }

  sessionStorage.removeItem(PLAYGROUND_TOKEN_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}
