import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { api, UnauthorizedError } from '@/lib/api';
import type { User } from '@/lib/api';

interface ExtendedUser extends User {
  profileCompleted?: boolean;
  phone?: string;
  course?: string;
  branch?: string;
  year?: string;
  isSuperAdmin?: boolean;
  isPresident?: boolean;
}

interface AuthContextType {
  user: ExtendedUser | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  login: (token: string) => Promise<ExtendedUser>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  devLogin: (email: string, name?: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const persistToken = useCallback((nextToken: string) => {
    localStorage.setItem('token', nextToken);
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
        localStorage.removeItem('token');
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
        const storedToken = localStorage.getItem('token');
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

  const refreshUser = useCallback(async () => {
    const currentToken = localStorage.getItem('token');
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
      localStorage.removeItem('token');
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
      localStorage.setItem('token', response.token);
      setToken(response.token);
      setUser(response.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
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
      localStorage.setItem('token', response.token);
      setToken(response.token);
      setUser(response.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
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
      localStorage.setItem('token', response.token);
      setToken(response.token);
      setUser(response.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    void api.logout().catch(() => {
      // Local state is still cleared even if server-side cookie cleanup fails.
    });
    localStorage.removeItem('token');
    localStorage.removeItem('network_intent');
    localStorage.removeItem('network_onboarding_type');
    setToken(null);
    setUser(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      error,
      login,
      loginWithEmail,
      register,
      devLogin,
      logout,
      clearError,
      refreshUser,
    }),
    [user, token, isLoading, error, login, loginWithEmail, register, devLogin, logout, clearError, refreshUser]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
