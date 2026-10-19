import type { Request, Response, NextFunction } from 'express';
import { RateLimitError } from '../errors/index.js';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const failedAttempts = new Map<string, RateLimitRecord>();

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

/**
 * Middleware that checks if the client IP has exceeded the allowed number
 * of failed login attempts within the active time window.
 */
export function loginRateLimitMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  const now = Date.now();
  const record = failedAttempts.get(ip);

  if (record) {
    if (now > record.resetAt) {
      // Window expired; reset record
      failedAttempts.delete(ip);
    } else if (record.count >= MAX_FAILED_ATTEMPTS) {
      const waitMinutes = Math.ceil((record.resetAt - now) / 60000);
      throw new RateLimitError(
        `Too many failed login attempts. Please try again in ${waitMinutes} minute${waitMinutes === 1 ? '' : 's'}.`
      );
    }
  }

  next();
}

/**
 * Records a failed login attempt for the client IP.
 */
export function recordFailedLogin(req: Request): void {
  const ip = getClientIp(req);
  const now = Date.now();
  const record = failedAttempts.get(ip);

  if (!record || now > record.resetAt) {
    failedAttempts.set(ip, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });
  } else {
    record.count += 1;
  }
}

/**
 * Clears failed login attempts for the client IP upon successful login.
 */
export function recordSuccessfulLogin(req: Request): void {
  const ip = getClientIp(req);
  failedAttempts.delete(ip);
}

/**
 * Resets all rate limit tracking. Used primarily in automated tests.
 */
export function resetLoginRateLimits(): void {
  failedAttempts.clear();
}
