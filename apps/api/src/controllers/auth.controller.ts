import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { NotFoundError } from '../errors/index.js';

export const DEV_OWNER_ID = '00000000-0000-0000-0000-000000000001';

export const authController = {
  getDevSession(req: Request, res: Response, next: NextFunction): void {
    try {
      // Security Boundary: Dev auth is strictly forbidden in production or when disabled
      const isDevAuthEnabled =
        (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') &&
        config.ENABLE_DEV_AUTH !== false;

      if (!isDevAuthEnabled) {
        throw new NotFoundError('The requested API endpoint does not exist');
      }

      // Token claims strictly bound to seeded development owner
      // Client-supplied parameters or queries are strictly ignored
      const payload = {
        sub: DEV_OWNER_ID,
        email: 'owner@example.com',
        role: 'authenticated',
        aud: 'authenticated',
        app_metadata: { provider: 'dev' },
        user_metadata: { name: 'Local Developer' },
      };

      const expiresInSeconds = 86400; // 24 hours
      const token = jwt.sign(payload, config.JWT_SECRET, {
        expiresIn: expiresInSeconds,
        issuer: 'animemanager-dev',
      });

      res.status(200).json({
        data: {
          token,
          ownerId: DEV_OWNER_ID,
          email: 'owner@example.com',
          expiresIn: expiresInSeconds,
          mode: 'development',
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
