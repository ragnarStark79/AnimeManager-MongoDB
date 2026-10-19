import type { Request, Response } from 'express';
import { config } from '../config/index.js';

export const SESSION_COOKIE_NAME = 'animemanager_session';
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Extracts a named cookie value from the raw request cookie header.
 */
export function getCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return null;
  }

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [rawKey, ...rest] = cookie.trim().split('=');
    if (rawKey === name) {
      return decodeURIComponent(rest.join('='));
    }
  }

  return null;
}

/**
 * Sets the secure session cookie with environment-aware flags.
 * - HttpOnly: Prevents client-side JavaScript access (XSS defense).
 * - Secure: Required on HTTPS production; relaxed for local HTTP development.
 * - SameSite: 'lax' provides strong CSRF protection while permitting top-level navigation.
 * - Path: '/' covers the entire application surface.
 * - MaxAge: 7 days.
 */
export function setSessionCookie(res: Response, token: string): void {
  const isProd = config.NODE_ENV === 'production';

  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  });
}

/**
 * Clears the session cookie on logout or invalid session revocation.
 */
export function clearSessionCookie(res: Response): void {
  const isProd = config.NODE_ENV === 'production';

  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
  });
}

/**
 * Validates request origin for state-changing requests authenticated via ambient cookies.
 * Prevents Cross-Site Request Forgery (CSRF).
 */
export function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  // In test environment, allow if no origin header is provided by supertest
  if (config.NODE_ENV === 'test' && !origin && !referer) {
    return true;
  }

  const allowed = config.CORS_ORIGIN.split(',').map((o) => o.trim().toLowerCase()).filter(Boolean);

  // If request supplies Origin header, verify against CORS_ORIGIN
  if (origin) {
    const normalizedOrigin = origin.trim().toLowerCase();
    return allowed.includes(normalizedOrigin) || allowed.includes('*');
  }

  // Fallback to Referer header if Origin is absent
  if (referer) {
    try {
      const parsedReferer = new URL(referer);
      const refererOrigin = `${parsedReferer.protocol}//${parsedReferer.host}`.toLowerCase();
      return allowed.includes(refererOrigin) || allowed.includes('*');
    } catch {
      return false;
    }
  }

  // Non-browser or direct requests without Origin/Referer in non-production
  return config.NODE_ENV !== 'production';
}
