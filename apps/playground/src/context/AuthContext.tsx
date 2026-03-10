import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { endExecutionSession } from '@/utils/snippetsApi';

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAIN_SITE_API =
  import.meta.env.VITE_MAIN_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:5001' : 'https://api.codescriet.dev');

const MAIN_SITE_URL =
  import.meta.env.VITE_MAIN_SITE_URL ||
  (import.meta.env.DEV ? 'http://localhost:5173' : 'https://codescriet.dev');

type FetchUserResult = {
  user: PlaygroundUser | null;
  token?: string;
  authFailed?: boolean;
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
    if (token) {
      // Persist for the current browser session so refreshes still work
      sessionStorage.setItem('pg_token', token);
      // Clean up URL so token doesn't stay visible
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    return token;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PlaygroundUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async (jwt?: string | null): Promise<FetchUserResult> => {
    try {
      const headers: Record<string, string> = {};
      if (jwt) {
        headers.Authorization = `Bearer ${jwt}`;
      }

      const res = await fetch(`${MAIN_SITE_API}/api/auth/me`, {
        headers,
        credentials: 'include',
      });
      if (!res.ok) {
        // Treat 401 as invalid auth; all other failures can be transient/network.
        return { user: null, authFailed: res.status === 401 };
      }
      const data = await res.json();
      // The main API returns { success: true, data: { ...user }, token?: string }
      const user = data.data || data.user || null;
      return { user: user || null, token: data.token };
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

      const result = await fetchUser(jwt);
      if (result.user) {
        setUser(result.user);
        // Prefer the token we already had; fall back to the one returned by /auth/me
        const resolvedToken = jwt || result.token || null;
        setToken(resolvedToken);
        // Ensure session token is always kept for refresh
        if (resolvedToken) sessionStorage.setItem('pg_token', resolvedToken);
      } else if (jwt && result.authFailed) {
        // Invalid token — clean up
        clearCookie('scriet_session');
        localStorage.removeItem('token');
        sessionStorage.removeItem('pg_token');
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
      const resolvedToken = jwt || result.token || null;
      setToken(resolvedToken);
      if (resolvedToken) sessionStorage.setItem('pg_token', resolvedToken);
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
export const getLoginUrl = () =>
  `${MAIN_SITE_URL}/signin?next=${encodeURIComponent(window.location.href)}`;

export const getRegisterUrl = () =>
  `${MAIN_SITE_URL}/signin?tab=register&next=${encodeURIComponent(window.location.href)}`;
