import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { RateLimitError } from '../errors/index.js';

export interface RateLimiterOptions {
  windowMs?: number;
  max?: number;
  maxEntries?: number;
  keyGenerator?: (req: Request) => string;
  message?: string;
}

interface ClientRecord {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private readonly records = new Map<string, ClientRecord>();
  private readonly windowMs: number;
  private readonly max: number;
  private readonly maxEntries: number;
  private readonly keyGenerator: (req: Request) => string;
  private readonly message: string;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(options: RateLimiterOptions = {}) {
    this.windowMs = options.windowMs ?? config.IMPORT_RATE_LIMIT_WINDOW_MS;
    this.max = options.max ?? config.IMPORT_RATE_LIMIT_MAX;
    this.maxEntries = options.maxEntries ?? 5000;
    this.message = options.message ?? `Rate limit exceeded. Maximum ${this.max} requests per ${Math.round(this.windowMs / 1000)} seconds.`;
    this.keyGenerator =
      options.keyGenerator ??
      ((req: Request) => {
        if (req.user?.id) {
          return `user:${req.user.id}`;
        }
        return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
      });

    // Clean up expired records every windowMs (unref to avoid hanging process exit)
    if (config.NODE_ENV !== 'test') {
      this.cleanupTimer = setInterval(() => this.cleanup(), this.windowMs);
      this.cleanupTimer.unref();
    }
  }

  public middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const now = Date.now();
      const key = this.keyGenerator(req);
      let record = this.records.get(key);

      if (!record || now >= record.resetTime) {
        // Enforce bounded memory ceiling: if capacity reached, cleanup and evict oldest entry
        if (this.records.size >= this.maxEntries && !this.records.has(key)) {
          this.cleanup();
          if (this.records.size >= this.maxEntries) {
            const oldestKey = this.records.keys().next().value;
            if (oldestKey) this.records.delete(oldestKey);
          }
        }
        record = {
          count: 0,
          resetTime: now + this.windowMs,
        };
        this.records.set(key, record);
      }

      record.count += 1;

      const remaining = Math.max(0, this.max - record.count);
      const resetSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));

      res.setHeader('RateLimit-Limit', this.max.toString());
      res.setHeader('RateLimit-Remaining', remaining.toString());
      res.setHeader('RateLimit-Reset', resetSeconds.toString());

      if (record.count > this.max) {
        res.setHeader('Retry-After', resetSeconds.toString());
        throw new RateLimitError(this.message, [
          {
            retryAfterSeconds: resetSeconds,
            limit: this.max,
            windowSeconds: Math.round(this.windowMs / 1000),
          },
        ]);
      }

      next();
    };
  }

  public reset(): void {
    this.records.clear();
  }

  public cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.records.entries()) {
      if (now >= record.resetTime) {
        this.records.delete(key);
      }
    }
  }

  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.records.clear();
  }
}

/**
 * Default preconfigured rate limiter for external metadata import endpoints.
 */
export const importRateLimiter = new RateLimiter({
  windowMs: config.IMPORT_RATE_LIMIT_WINDOW_MS,
  max: config.IMPORT_RATE_LIMIT_MAX,
  message: `Import request limit reached (${config.IMPORT_RATE_LIMIT_MAX} requests per minute). Please wait before making more requests.`,
});

export const importRateLimitMiddleware = importRateLimiter.middleware();
