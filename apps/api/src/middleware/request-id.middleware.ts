import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: {
        id: string;
        email?: string;
        role?: string;
      };
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-request-id'];
  const requestId = typeof incomingId === 'string' && incomingId.trim().length > 0
    ? incomingId.trim()
    : `req_${crypto.randomUUID().replace(/-/g, '')}`;

  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}
