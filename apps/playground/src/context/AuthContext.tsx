import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { endExecutionSession } from '@/utils/snippetsApi';
import { getMainApiCandidates, getMainSiteOrigin, rememberMainApiOrigin } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlaygroundUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string | null;
}

interface AuthContextType {
  user: PlaygroundUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Call the main site API to validate the session */
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_RETRY_KEY = 'pg_auth_retry_done';
const RETURN_PARAM_KEY = 'pg_return';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAIN_SITE_URL = getMainSiteOrigin();
const PLAYGROUND_API =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:5002' : 'https://playground-api.codescriet.dev');

type FetchUserResult = {
  user: PlaygroundUser | null;
  token?: string;
  authFailed?: boolean;
};

type FetchAttempt =
  | {
      ok: true;
      user: PlaygroundUser | null;
      token?: string;
      apiOrigin: string;
    }
  | {
      ok: false;
      status: number;
      apiOrigin: string;
      networkError?: boolean;
    };

type AccessTokenPayload = {
  id?: string;
  userId?: string;
  name?: string;
  email?: string;
  role?: string;
  avatar?: string | null;
  exp?: number;
};

/** Read a cookie value by name */
function getCookie(name: string): string | null {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

/** Clear the session cookie (must match domain used when setting) */
function clearCookie(name: string) {
  const isProd = !import.meta.env.DEV;
  const domainPart = isProd ? '; domain=.codescriet.dev' : '';
  document.cookie = `${name}=; Max-Age=0; path=/${domainPart}`;
}

/**
 * Extract token passed via URL hash from the main site dashboard.
 * e.g. http://localhost:5174/#token=eyJhbGci...
 * Reads it once, stores in sessionStorage, then removes it from the URL.
 */
function consumeHashToken(): string | null {
  try {
    const hash = window.location.hash;
    if (!hash) return null;
    const params = new URLSearchParams(hash.slice(1)); // strip leading '#'
    const token = params.get('token');
    const apiOverride = params.get('api');
    if (token) {
      // Persist for the current browser session so refreshes still work
      sessionStorage.setItem('pg_token', token);
    }
    if (apiOverride) {
      rememberMainApiOrigin(apiOverride);
    }
    if (token || apiOverride) {
      // Clean up URL so auth handoff data doesn't stay visible
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    return token;
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string): AccessTokenPayload | null {
  try {
    const [, payload = ''] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized);
    const parsed = JSON.parse(decoded) as AccessTokenPayload;
    return parsed;
  } catch {
    return null;
  }
}

function isExpiredToken(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return false;
  return payload.exp * 1000 <= Date.now();
}

function buildOptimisticUser(token: string): PlaygroundUser | null {
  if (isExpiredToken(token)) return null;
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const id = payload.userId || payload.id;
  if (!id || !payload.email || !payload.role) return null;
  return {
    id,
    name: payload.name || payload.email.split('@')[0] || 'User',
    email: payload.email,
    role: payload.role,
    avatar: payload.avatar ?? null,
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PlaygroundUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async (jwt?: string | null): Promise<FetchUserResult> => {
    const requestMe = async (apiOrigin: string, withJwt?: string | null): Promise<FetchAttempt> => {
      try {
        const headers: Record<string, string> = {};
        if (withJwt) {
          headers.Authorization = `Bearer ${withJwt}`;
        }
        const res = await fetch(`${apiOrigin}/api/auth/me`, {
          headers,
          credentials: 'include',
        });
        if (!res.ok) {
          return { ok: false as const, status: res.status, apiOrigin };
        }
        const data = await res.json();
        const user = data.data || data.user || null;
        return {
          ok: true as const,
          user: user || null,
          token: typeof data.token === 'string' ? data.token : undefined,
          apiOrigin,
        };
      } catch {
        return {
          ok: false as const,
          status: 0,
          apiOrigin,
          networkError: true,
        };
      }
    };

    try {
      const candidates = getMainApiCandidates();
      let sawUnauthorized = false;
      let sawReachableResponse = false;
      for (const apiOrigin of candidates) {
        const primary = await requestMe(apiOrigin, jwt);
        if (primary.ok) {
          rememberMainApiOrigin(primary.apiOrigin);
          return { user: primary.user, token: primary.token };
        }
        if (!primary.networkError) {
          sawReachableResponse = true;
        }

        // If bearer token is stale, retry once without Authorization so cookie auth can succeed.
        if (jwt && primary.status === 401) {
          const cookieFallback = await requestMe(apiOrigin, null);
          if (cookieFallback.ok) {
            rememberMainApiOrigin(cookieFallback.apiOrigin);
            return { user: cookieFallback.user, token: cookieFallback.token };
          }
          if (!cookieFallback.networkError) {
            sawReachableResponse = true;
          }
          if (cookieFallback.status === 401) {
            sawUnauthorized = true;
          }
          continue;
        }

        if (primary.status === 401) {
          sawUnauthorized = true;
        }
      }

      // Local fallback via playground API to keep auth/profile functional even if main API origin is flaky.
      const localPrimary = await requestMe(PLAYGROUND_API, jwt);
      if (localPrimary.ok) {
        return { user: localPrimary.user, token: localPrimary.token || jwt || undefined };
      }
      if (!localPrimary.networkError) {
        sawReachableResponse = true;
      }

      if (jwt && localPrimary.status === 401) {
        const localCookieFallback = await requestMe(PLAYGROUND_API, null);
        if (localCookieFallback.ok) {
          return { user: localCookieFallback.user, token: localCookieFallback.token || undefined };
        }
        if (!localCookieFallback.networkError) {
          sawReachableResponse = true;
        }
        if (localCookieFallback.status === 401) {
          sawUnauthorized = true;
        }
      } else if (localPrimary.status === 401) {
        sawUnauthorized = true;
      }

      return { user: null, authFailed: sawUnauthorized && sawReachableResponse };
    } catch {
      // Network/CORS/server issues should not wipe a valid local session cookie.
      return { user: null, authFailed: false };
    }
  }, []);

  // On mount, look for token in URL hash → sessionStorage → cookie → localStorage
  useEffect(() => {
    const init = async () => {
      // 1. Hash token passed from main-site dashboard (highest priority, cleared after read)
      const hashToken = consumeHashToken();
      // 2. Session-scoped token (survives refresh within same browser tab session)
      const sessionToken = sessionStorage.getItem('pg_token');
      // 3. scriet_session cookie (readable when httpOnly:false, domain=localhost)
      const cookieToken = getCookie('scriet_session');
      // 4. localStorage token (dev fallback — same origin only)
      const storageToken = localStorage.getItem('token');

      const jwt = hashToken || sessionToken || cookieToken || storageToken;
      const optimisticUser = hashToken ? buildOptimisticUser(hashToken) : null;
      if (optimisticUser && hashToken) {
        setUser(optimisticUser);
        setToken(hashToken);
        sessionStorage.setItem('pg_token', hashToken);
        markAuthRecovered();
        setIsLoading(false);
      }

      const result = await fetchUser(jwt);
      if (result.user) {
        setUser(result.user);
        // Prefer a fresh token returned by /auth/me (prevents stale bearer loops).
        const resolvedToken = result.token || jwt || null;
        setToken(resolvedToken);
        // Ensure session token is always kept for refresh
        if (resolvedToken) sessionStorage.setItem('pg_token', resolvedToken);
        markAuthRecovered();
      } else if (jwt && result.authFailed) {
        // Invalid token — clean up
        clearCookie('scriet_session');
        localStorage.removeItem('token');
        sessionStorage.removeItem('pg_token');
        setUser(null);
        setToken(null);
      } else if (!optimisticUser) {
        setUser(null);
        setToken(null);
      }
      setIsLoading(false);
    };
    init();
  }, [fetchUser]);

  const refreshUser = useCallback(async () => {
    const jwt = sessionStorage.getItem('pg_token') || getCookie('scriet_session') || localStorage.getItem('token');
    const result = await fetchUser(jwt);
    if (result.user) {
      setUser(result.user);
      const resolvedToken = result.token || jwt || null;
      setToken(resolvedToken);
      if (resolvedToken) sessionStorage.setItem('pg_token', resolvedToken);
      markAuthRecovered();
    } else if (jwt && result.authFailed) {
      clearCookie('scriet_session');
      localStorage.removeItem('token');
      sessionStorage.removeItem('pg_token');
      setUser(null);
      setToken(null);
    }
  }, [fetchUser]);

  const logout = useCallback(() => {
    // Flush buffered execution history/usage before removing auth token
    endExecutionSession();
    clearCookie('scriet_session');
    localStorage.removeItem('token');
    sessionStorage.removeItem('pg_token');
    setUser(null);
    setToken(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated: !!user,
      refreshUser,
      logout,
    }),
    [user, token, isLoading, refreshUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** URL to redirect to for login on the main site */
export const getLoginUrl = (nextUrl?: string) =>
  `${MAIN_SITE_URL}/signin?next=${encodeURIComponent(nextUrl || window.location.href)}`;

export const getRegisterUrl = (nextUrl?: string) =>
  `${MAIN_SITE_URL}/signin?tab=register&next=${encodeURIComponent(nextUrl || window.location.href)}`;

export const getPlaygroundReturnUrl = (): string => {
  const url = new URL(window.location.href);
  url.searchParams.set(RETURN_PARAM_KEY, '1');
  return url.toString();
};

export const shouldAutoRedirectToLogin = (): boolean => {
  try {
    const params = new URLSearchParams(window.location.search);
    const hasReturnMarker = params.get(RETURN_PARAM_KEY) === '1';
    if (!hasReturnMarker) return false;
    if (sessionStorage.getItem(AUTH_RETRY_KEY) === '1') return false;
    sessionStorage.setItem(AUTH_RETRY_KEY, '1');
    return true;
  } catch {
    return false;
  }
};

export const markAuthRecovered = (): void => {
  try {
    sessionStorage.removeItem(AUTH_RETRY_KEY);
    const url = new URL(window.location.href);
    if (url.searchParams.has(RETURN_PARAM_KEY)) {
      url.searchParams.delete(RETURN_PARAM_KEY);
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
  } catch {
    // no-op
  }
};
