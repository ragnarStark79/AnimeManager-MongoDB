import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { UnauthorizedError, ForbiddenError } from '../errors/index.js';
import { getCookie, clearSessionCookie, isAllowedOrigin, SESSION_COOKIE_NAME } from '../utils/cookie.js';
import { sessionsRepository } from '../repositories/sessions.repository.js';
import { rootAdminsRepository } from '../repositories/root-admins.repository.js';
import { superAdminsRepository } from '../repositories/super-admins.repository.js';
import { usersRepository } from '../repositories/users.repository.js';

export const CANONICAL_OWNER_ID = '00000000-0000-0000-0000-000000000001';

interface JwtPayload {
  sub: string;
  email?: string;
  role?: string;
  [key: string]: unknown;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Authentication Middleware supporting:
 * 1. Native session cookies for Root Admins, Super Admins, and ordinary Users
 * 2. Legacy Bearer JWT tokens in Authorization header (backward compatibility)
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // ── Strategy 1: Native Session Cookie ──
    const sessionToken = getCookie(req, SESSION_COOKIE_NAME);

    if (sessionToken) {
      const session = await sessionsRepository.findValidSession(sessionToken);

      if (!session) {
        clearSessionCookie(res);
        throw new UnauthorizedError('Invalid or expired authentication session');
      }

      // CSRF Protection for state-changing methods authenticated via cookie
      if (MUTATING_METHODS.has(req.method.toUpperCase())) {
        if (!isAllowedOrigin(req)) {
          throw new ForbiddenError('Cross-origin request rejected (CSRF protection)');
        }
      }

      if (session.role === 'root_admin') {
        const rootAdmin = await rootAdminsRepository.findById(session.accountId);
        if (!rootAdmin || rootAdmin.status !== 'active') {
          clearSessionCookie(res);
          throw new UnauthorizedError('Root Administrator account is inactive or revoked');
        }
        req.user = {
          id: rootAdmin._id,
          email: rootAdmin.email,
          username: rootAdmin.username,
          displayName: rootAdmin.displayName,
          role: 'root_admin',
          adminId: rootAdmin._id,
        };
        return next();
      }

      if (session.role === 'superadmin') {
        const admin = await superAdminsRepository.findById(session.accountId);
        if (!admin || admin.status !== 'active') {
          clearSessionCookie(res);
          throw new UnauthorizedError('Administrator account is inactive or revoked');
        }
        req.user = {
          id: admin._id,
          email: admin.email,
          username: admin.username,
          displayName: admin.displayName,
          role: 'superadmin',
          adminId: admin._id,
        };
        return next();
      }

      if (session.role === 'user') {
        const user = await usersRepository.findById(session.accountId);
        if (!user || user.status === 'disabled' || user.status === 'deleted') {
          clearSessionCookie(res);
          throw new UnauthorizedError('User account is inactive or disabled');
        }
        if (user.status === 'restricted' && MUTATING_METHODS.has(req.method.toUpperCase())) {
          throw new ForbiddenError('Account is restricted from performing modifications');
        }
        req.user = {
          id: user._id, // User's personal library owner ID
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          role: 'user',
          status: user.status,
        };
        return next();
      }

      clearSessionCookie(res);
      throw new UnauthorizedError('Invalid session role');
    }

    // ── Strategy 2: Legacy Bearer JWT in Authorization Header ──
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

      if (!UUID_REGEX.test(decoded.sub)) {
        throw new UnauthorizedError('Invalid token claims: subject identifier (sub) must be a valid UUID');
      }

      if (decoded.role === 'anon' || decoded.aud === 'anon') {
        throw new UnauthorizedError('Invalid token claims: anonymous role not permitted for protected resources');
      }

      if (decoded.type === 'mfa_challenge') {
        throw new UnauthorizedError('Pending MFA challenge token cannot be used as an authenticated bearer token');
      }

      req.user = {
        id: decoded.sub,
        email: decoded.email,
        role: decoded.role,
      };

      return next();
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
  } catch (err) {
    next(err);
  }
}
