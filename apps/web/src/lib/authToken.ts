const TOKEN_STORAGE_KEY = 'token';

export function getStoredAuthToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const sessionToken = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  if (sessionToken) {
    return sessionToken;
  }

  // One-time migration from legacy localStorage token to sessionStorage.
  const legacyToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  if (legacyToken) {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, legacyToken);
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    return legacyToken;
  }

  return null;
}

export function storeAuthToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  // Ensure token is not persisted across browser restarts.
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function clearStoredAuthToken(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}
