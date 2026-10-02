import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { api, UnauthorizedError } from '@/lib/api';
import type { User } from '@/lib/api';
import { AUTH_TOKEN_STORAGE_KEY, clearStoredAuthToken, getStoredAuthToken, storeAuthToken } from '@/lib/authToken';

interface ExtendedUser extends User {
  profileCompleted?: boolean;
  phone?: string;
  course?: string;
  branch?: string;
  year?: string;
  isSuperAdmin?: boolean;
  isPresident?: boolean;
}

interface AuthState {
  user: ExtendedUser | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  login: (token: string) => Promise<ExtendedUser>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  devLogin: (email: string, name?: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  refreshUser: () => Promise<void>;
  /** Replace the stored session token without the full login() loading cycle.
   *  Used when the API rotates the session (e.g. password change bumps
   *  tokenVersion and returns a fresh token). */
  adoptToken: (token: string) => void;
}

type AuthContextType = AuthState & AuthActions;

// Two contexts so action-only consumers (e.g. a logout button) don't re-render
// every time user/token/isLoading/error changes. `useAuth()` still returns the
// combined shape for backward compatibility.
const AuthStateContext = createContext<AuthState | undefined>(undefined);
const AuthActionsContext = createContext<AuthActions | undefined>(undefined);

interface DecodedAccessTokenPayload {
  userId?: string;
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  exp?: number;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return window.atob(`${normalized}${padding}`);
}

function readUserFromToken(token: string): ExtendedUser | null {
  const [, payloadSegment] = token.split('.');
  if (!payloadSegment) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(payloadSegment)) as DecodedAccessTokenPayload;
    if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
      return null;
    }

    const id = typeof payload.userId === 'string'
      ? payload.userId
      : typeof payload.id === 'string'
        ? payload.id
        : null;

    if (!id || typeof payload.email !== 'string' || typeof payload.role !== 'string') {
      return null;
    }

    return {
      id,
      name: typeof payload.name === 'string' ? payload.name : payload.email.split('@')[0],
      email: payload.email,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<ExtendedUser | null>(null);
  const [token, setToken] = useState<string | null>(getStoredAuthToken());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const persistToken = useCallback((nextToken: string) => {
    storeAuthToken(nextToken);
    setToken(nextToken);
  }, []);

  const fetchUser = useCallback(async (authToken: string | null): Promise<ExtendedUser | null> => {
    try {
      const response = await api.getMeWithToken(authToken);
      if (response.token) {
        persistToken(response.token);
      }
      return response.user as ExtendedUser | null;
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        // Only announce expiry when a session actually existed — first-time
        // anonymous visitors should not see a toast on boot.
        if (authToken) {
          toast.error('Your session has expired. Please sign in again.', { id: 'session-expired' });
        }
        clearStoredAuthToken();
        return null;
      }

      const fallbackUser = authToken ? readUserFromToken(authToken) : null;
      if (fallbackUser) {
        return fallbackUser;
      }

      throw err;
    }
  }, [persistToken]);

  // ISSUE-035: Use ref to track component mount status for cleanup
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const initAuth = async () => {
      try {
        const storedToken = getStoredAuthToken();
        const userData = await fetchUser(storedToken);
        // Only update state if still mounted
        if (isMountedRef.current) {
          if (!userData) {
            setToken(null);
          }
          setUser(userData);
        }
      } catch (err) {
        if (isMountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to restore session');
        }
      }
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    };

    initAuth();

    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchUser]);

  // Cross-tab logout sync. `storage` events fire in OTHER same-origin tabs when
  // localStorage changes. When another tab clears the auth token (logout), drop
  // this tab's session too — including this tab's own per-tab sessionStorage copy,
  // which the logging-out tab cannot reach. We deliberately do NOT call
  // api.logout() here: the other tab already invalidated the session server-side
  // (tokenVersion bump), so we only clear local state and avoid a redundant
  // cross-tab logout storm.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== window.localStorage) return;
      // key === null means localStorage.clear(); otherwise only react to the token key.
      if (event.key !== null && event.key !== AUTH_TOKEN_STORAGE_KEY) return;
      const stillSignedIn = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
      if (!stillSignedIn) {
        clearStoredAuthToken();
        setToken(null);
        setUser(null);
        setError(null);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const refreshUser = useCallback(async () => {
    const currentToken = getStoredAuthToken();
    try {
      const userData = await fetchUser(currentToken);
      setUser(userData);
      if (!userData) {
        setToken(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh session');
    }
  }, [fetchUser]);

  const login = useCallback(async (newToken: string): Promise<ExtendedUser> => {
    setIsLoading(true);
    setError(null);
    try {
      persistToken(newToken);
      const userData = await fetchUser(newToken);
      if (userData) {
        setUser(userData);
        return userData;
      } else {
        throw new Error('Failed to get user data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      clearStoredAuthToken();
      setToken(null);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [fetchUser, persistToken]);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.login(email, password);
      storeAuthToken(response.token);
      setToken(response.token);
      setUser(response.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      clearStoredAuthToken();
      setToken(null);
      setUser(null);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.register(name, email, password);
      storeAuthToken(response.token);
      setToken(response.token);
      setUser(response.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
      clearStoredAuthToken();
      setToken(null);
      setUser(null);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const devLogin = useCallback(async (email: string, name?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.devLogin(email, name);
      storeAuthToken(response.token);
      setToken(response.token);
      setUser(response.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      clearStoredAuthToken();
      setToken(null);
      setUser(null);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    void api.logout().catch(() => {
      // Local state is still cleared even if server-side cookie cleanup fails.
    });
    clearStoredAuthToken();
    localStorage.removeItem('network_intent');
    localStorage.removeItem('network_onboarding_type');
    setToken(null);
    setUser(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // Actions object is stable identity after first mount (every callback is
  // memoized via useCallback with stable deps). Splitting into its own context
  // means action-only consumers never re-render when state changes.
  const actions = useMemo<AuthActions>(
    () => ({ login, loginWithEmail, register, devLogin, logout, clearError, refreshUser, adoptToken: persistToken }),
    [login, loginWithEmail, register, devLogin, logout, clearError, refreshUser, persistToken],
  );

  const state = useMemo<AuthState>(
    () => ({ user, token, isLoading, error }),
    [user, token, isLoading, error],
  );

  return (
    <AuthActionsContext.Provider value={actions}>
      <AuthStateContext.Provider value={state}>
        {children}
      </AuthStateContext.Provider>
    </AuthActionsContext.Provider>
  );
};

export function useAuthState(): AuthState {
  const ctx = useContext(AuthStateContext);
  if (!ctx) throw new Error('useAuthState must be used within AuthProvider');
  return ctx;
}

export function useAuthActions(): AuthActions {
  const ctx = useContext(AuthActionsContext);
  if (!ctx) throw new Error('useAuthActions must be used within AuthProvider');
  return ctx;
}

// Backward-compatible combined hook. Subscribes to both contexts, so it
// re-renders on any state change (same as before the split). New code that
// only needs the actions should use useAuthActions() to avoid the re-render.
export function useAuth(): AuthContextType {
  const state = useAuthState();
  const actions = useAuthActions();
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
}
