import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api, isTokenExpired } from './api-client';

interface JwtPayload {
  sub?: string;
  email?: string;
  role?: string;
  exp?: number;
  iss?: string;
}

interface AuthContextValue {
  token: string | null;
  isAuthenticated: boolean;
  ownerId: string | null;
  email: string | null;
  isDevAuth: boolean;
  isLoading: boolean;
  error: string | null;
  setToken: (token: string | null) => void;
  refreshDevToken: () => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'animemanager_auth_token';

export function parseJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload) as JwtPayload;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem('animemanager_auth_token');
    if (stored && !isTokenExpired(stored)) {
      return stored;
    }
    if (stored && isTokenExpired(stored)) {
      localStorage.removeItem('animemanager_auth_token');
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(!token && import.meta.env.DEV);
  const [error, setError] = useState<string | null>(null);
  const lastRefreshAttemptRef = useRef<number>(0);

  const parsed = useMemo(() => (token ? parseJwt(token) : null), [token]);

  const isDevAuth = useMemo(() => {
    if (!token || !parsed) return false;
    return parsed.iss === 'animemanager-dev' || parsed.sub === '00000000-0000-0000-0000-000000000001';
  }, [token, parsed]);

  const setToken = useCallback((newToken: string | null) => {
    if (newToken && isTokenExpired(newToken)) {
      console.warn('[Auth] Attempted to set an expired token. Ignoring.');
      return;
    }
    setTokenState(newToken);
    api.setToken(newToken);
    if (!newToken && typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    setError(null);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
  }, [setToken]);

  const refreshDevToken = useCallback(async (): Promise<boolean> => {
    if (!import.meta.env.DEV) {
      setError('Development token refresh is only available in development mode.');
      return false;
    }

    try {
      setError(null);
      const session = await api.auth.getDevSession();
      if (session && session.token) {
        setToken(session.token);
        return true;
      }
      throw new Error('Received empty token from development session endpoint.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to obtain development session';
      setError(msg);
      return false;
    }
  }, [setToken]);

  // Synchronize api client token on mount and updates
  useEffect(() => {
    api.setToken(token);

    const unsubscribe = api.onUnauthorized(() => {
      console.warn('[Auth] Received HTTP 401 Unauthorized from API. Cleaning up session.');
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }

      // In dev mode, attempt transparent token refresh at most once every 15s to prevent loops
      const now = Date.now();
      if (import.meta.env.DEV && now - lastRefreshAttemptRef.current > 15000) {
        lastRefreshAttemptRef.current = now;
        console.info('[Auth] Attempting development token auto-recovery...');
        refreshDevToken().catch(() => {
          setTokenState(null);
          setError('Session expired. Please click Refresh Dev Session in Settings.');
        });
      } else {
        setTokenState(null);
        setError('Session expired. Please re-authenticate in Settings.');
      }
    });

    return unsubscribe;
  }, [token, refreshDevToken]);

  // On mount: If no valid token in dev mode, fetch dev session automatically
  useEffect(() => {
    let isMounted = true;

    async function initDevSession() {
      if (!token && import.meta.env.DEV) {
        try {
          const session = await api.auth.getDevSession();
          if (isMounted && session?.token) {
            setToken(session.token);
          }
        } catch {
          if (isMounted) {
            setError('Could not connect to development authentication endpoint. Ensure API is running.');
          }
        } finally {
          if (isMounted) {
            setIsLoading(false);
          }
        }
      } else {
        setIsLoading(false);
      }
    }

    initDevSession();

    return () => {
      isMounted = false;
    };
  }, []); // Run once on initial mount

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      isAuthenticated: Boolean(token),
      ownerId: parsed?.sub || null,
      email: parsed?.email || null,
      isDevAuth,
      isLoading,
      error,
      setToken,
      refreshDevToken,
      logout,
    }),
    [token, parsed, isDevAuth, isLoading, error, setToken, refreshDevToken, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
