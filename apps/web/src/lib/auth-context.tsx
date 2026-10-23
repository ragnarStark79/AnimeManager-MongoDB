import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api, isTokenExpired, type RegisterUserInput, type AuthUser } from './api-client.js';

export type { AuthUser };

interface JwtPayload {
  sub?: string;
  email?: string;
  role?: string;
  exp?: number;
  iss?: string;
}

export interface LoginResult {
  success: boolean;
  mfaRequired?: boolean;
  challengeToken?: string;
  role?: string;
  error?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  ownerId: string | null;
  email: string | null;
  username: string | null;
  displayName: string | null;
  isRootAdmin: boolean;
  isSuperAdmin: boolean;
  isOrdinaryUser: boolean;
  isDevAuth: boolean;
  isLoading: boolean;
  error: string | null;
  register: (input: RegisterUserInput) => Promise<boolean>;
  login: (credentials: { email: string; password: string }) => Promise<LoginResult>;
  completeMfaChallenge: (challengeToken: string, code: string) => Promise<boolean>;
  logout: () => Promise<void>;
  setToken: (token: string | null) => void;
  refreshDevToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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
  const [user, setUser] = useState<AuthUser | null>(null);
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

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const lastRefreshAttemptRef = useRef<number>(0);

  const parsed = useMemo(() => (token ? parseJwt(token) : null), [token]);

  const isDevAuth = useMemo(() => {
    if (user?.role === 'superadmin' || user?.role === 'root_admin') return false;
    if (!token || !parsed) return false;
    return parsed.iss === 'animemanager-dev' || parsed.sub === '00000000-0000-0000-0000-000000000001';
  }, [user, token, parsed]);

  // Set legacy token for Settings fallback
  const setToken = useCallback((newToken: string | null) => {
    if (newToken && isTokenExpired(newToken)) {
      console.warn('[Auth] Attempted to set an expired token. Ignoring.');
      return;
    }
    setTokenState(newToken);
    api.setToken(newToken);
    if (!newToken && typeof window !== 'undefined') {
      localStorage.removeItem('animemanager_auth_token');
    }
    setError(null);
  }, []);

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

  // Native user registration implementation
  const register = useCallback(async (input: RegisterUserInput): Promise<boolean> => {
    try {
      setError(null);
      const res = await api.auth.register(input);
      if (res && res.user) {
        setUser(res.user);
        return true;
      }
      throw new Error('Registration failed: invalid response from server');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      setError(msg);
      return false;
    }
  }, []);

  // Native login implementation
  const login = useCallback(async (credentials: { email: string; password: string }): Promise<LoginResult> => {
    try {
      setError(null);
      const res = await api.auth.login(credentials);
      if (res && res.mfaRequired && res.challengeToken) {
        return {
          success: true,
          mfaRequired: true,
          challengeToken: res.challengeToken,
          role: res.role,
        };
      }
      if (res && res.user) {
        setUser(res.user);
        return { success: true };
      }
      throw new Error('Login failed: invalid response from server');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg);
      return { success: false, error: msg };
    }
  }, []);

  // Complete MFA Challenge during login
  const completeMfaChallenge = useCallback(async (challengeToken: string, code: string): Promise<boolean> => {
    try {
      setError(null);
      const res = await api.auth.mfa.challengeVerify(challengeToken, code);
      if (res && res.user) {
        setUser(res.user);
        return true;
      }
      throw new Error('Verification failed: invalid response from server');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification failed';
      setError(msg);
      throw err;
    }
  }, []);

  // Safe server-side logout
  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Ignore network errors on logout
    } finally {
      setUser(null);
      setToken(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('animemanager_auth_token');
      }
      setError(null);
    }
  }, [setToken]);

  // Handle 401 Unauthorized API responses
  useEffect(() => {
    api.setToken(token);

    const unsubscribe = api.onUnauthorized(() => {
      console.warn('[Auth] Received HTTP 401 Unauthorized from API.');
      setUser(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('animemanager_auth_token');
      }
      setTokenState(null);

      // In dev mode, debounce refresh attempts to prevent loops (15000ms window)
      const now = Date.now();
      if (import.meta.env.DEV && now - lastRefreshAttemptRef.current > 15000) {
        lastRefreshAttemptRef.current = now;
      }
    });

    return unsubscribe;
  }, [token]);

  // Check active session on initial mount
  useEffect(() => {
    let isMounted = true;

    async function checkActiveSession() {
      try {
        const meRes = await api.auth.getMe();
        if (isMounted && meRes?.user) {
          setUser(meRes.user);
          setIsLoading(false);
          return;
        }
      } catch {
        // No valid session cookie
      }

      if (isMounted) {
        setUser(null);
        setIsLoading(false);
      }
    }

    checkActiveSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const isAuthenticated = Boolean(user || token);
  // User ID mapping: user?.id takes priority, with fallback: ownerId: parsed?.sub || null
  const ownerId = user?.id || parsed?.sub || null;
  const email = user?.email || parsed?.email || null;
  const username = user?.username || null;
  const displayName = user?.displayName || (username || (email ? email.split('@')[0] : 'User'));
  const isRootAdmin = Boolean(user && user.role === 'root_admin');
  const isSuperAdmin = Boolean(user && user.role === 'superadmin');
  const isOrdinaryUser = Boolean(user && user.role === 'user');

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated,
      ownerId,
      email,
      username,
      displayName,
      isRootAdmin,
      isSuperAdmin,
      isOrdinaryUser,
      isDevAuth,
      isLoading,
      error,
      register,
      login,
      completeMfaChallenge,
      logout,
      setToken,
      refreshDevToken,
    }),
    [
      user,
      token,
      isAuthenticated,
      ownerId,
      email,
      username,
      displayName,
      isRootAdmin,
      isSuperAdmin,
      isOrdinaryUser,
      isDevAuth,
      isLoading,
      error,
      register,
      login,
      completeMfaChallenge,
      logout,
      setToken,
      refreshDevToken,
    ]
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
