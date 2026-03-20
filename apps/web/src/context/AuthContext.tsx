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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<ExtendedUser | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async (token: string): Promise<ExtendedUser | null> => {
    try {
      const userData = await api.getMe(token);
      return userData as ExtendedUser;
    } catch (err) {
      // ISSUE-013: Handle 401 by clearing auth state
      if (err instanceof UnauthorizedError) {
        console.warn('Session expired or invalid');
        localStorage.removeItem('token');
        return null;
      }
      console.error('Failed to fetch user:', err);
      localStorage.removeItem('token');
      return null;
    }
  }, []);

  // ISSUE-035: Use ref to track component mount status for cleanup
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        const userData = await fetchUser(token);
        // Only update state if still mounted
        if (isMountedRef.current) {
          if (!userData) {
            setToken(null);
          }
          setUser(userData);
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
    if (currentToken) {
      const userData = await fetchUser(currentToken);
      setUser(userData);
    }
  }, [fetchUser]);

  const login = useCallback(async (newToken: string): Promise<ExtendedUser> => {
    setIsLoading(true);
    setError(null);
    try {
      localStorage.setItem('token', newToken);
      setToken(newToken);
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
  }, [fetchUser]);

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
