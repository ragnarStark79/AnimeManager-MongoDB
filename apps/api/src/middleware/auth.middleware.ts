import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { UnauthorizedError } from '../errors/index.js';

interface JwtPayload {
  sub: string;
  email?: string;
  role?: string;
  [key: string]: unknown;
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new UnauthorizedError('Authentication token is required');
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    throw new UnauthorizedError('Malformed Authorization header; expected "Bearer <token>"');
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ['HS256'],
    }) as JwtPayload;

    if (!decoded || !decoded.sub || typeof decoded.sub !== 'string') {
      throw new UnauthorizedError('Invalid token claims: subject identifier (sub) missing');
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(decoded.sub)) {
      throw new UnauthorizedError('Invalid token claims: subject identifier (sub) must be a valid UUID');
    }

    if (decoded.role === 'anon' || decoded.aud === 'anon') {
      throw new UnauthorizedError('Invalid token claims: anonymous role not permitted for protected resources');
    }

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      throw err;
    }
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Invalid or expired authentication token: token has expired');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid or expired authentication token: signature verification failed');
    }
    throw new UnauthorizedError('Invalid or expired authentication token');
  }
}
