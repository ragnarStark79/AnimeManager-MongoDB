import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { loginInputSchema, registerUserInputSchema } from '@animemanager/shared';
import { config } from '../config/index.js';
import { NotFoundError, UnauthorizedError, BadRequestError, ConflictError } from '../errors/index.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { getCookie, setSessionCookie, clearSessionCookie, SESSION_COOKIE_NAME } from '../utils/cookie.js';
import { rootAdminsRepository } from '../repositories/root-admins.repository.js';
import { superAdminsRepository } from '../repositories/super-admins.repository.js';
import { usersRepository } from '../repositories/users.repository.js';
import { sessionsRepository } from '../repositories/sessions.repository.js';
import { auditLogsRepository } from '../repositories/audit-logs.repository.js';
import { accountMfaRepository } from '../repositories/account-mfa.repository.js';
import { generateMfaChallengeToken } from '../utils/mfa-crypto.js';
import { recordFailedLogin, recordSuccessfulLogin } from '../middleware/login-rate-limit.middleware.js';

export const DEV_OWNER_ID = '00000000-0000-0000-0000-000000000001';

export const authController = {
  /**
   * Ordinary User Registration endpoint.
   * Public registration requiring username, full name, email, password, and confirmation.
   * Enforces uniqueness, scrypt password hashing, and issues a session cookie upon success.
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = registerUserInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid user registration payload', parsed.error.issues);
      }

      const { username, displayName, email, password } = parsed.data;
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedUsername = username.trim().toLowerCase();

      // Check unique email across users
      const existingEmail = await usersRepository.findByEmail(normalizedEmail);
      if (existingEmail) {
        throw new ConflictError(`Email "${normalizedEmail}" is already registered`);
      }

      // Check unique username across users
      const existingUsername = await usersRepository.findByUsername(normalizedUsername);
      if (existingUsername) {
        throw new ConflictError(`Username "${normalizedUsername}" is already taken`);
      }

      const passwordHash = await hashPassword(password);
      const user = await usersRepository.create({
        username: normalizedUsername,
        email: normalizedEmail,
        displayName: displayName.trim(),
        passwordHash,
        status: 'active',
      });

      // Record privacy-preserving audit log
      await auditLogsRepository.recordEvent({
        eventType: 'user.registered',
        actorId: user._id,
        actorRole: 'user',
        targetId: user._id,
        targetType: 'user',
        action: 'User registered account',
        outcome: 'success',
        metadata: { username: user.username },
      });

      const clientIp = typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : req.ip || req.socket.remoteAddress || null;

      const userAgent = req.headers['user-agent'] || null;

      // Issue session cookie
      const { token } = await sessionsRepository.createUserSession(user._id, {
        ipAddress: clientIp,
        userAgent,
      });

      setSessionCookie(res, token);

      res.status(201).json({
        data: {
          user: {
            id: user._id,
            username: user.username,
            displayName: user.displayName,
            email: user.email,
            role: 'user',
            status: user.status,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Unified email + password login for Root Admins, Super Admins, and ordinary Users.
   * Checks root_admins, super_admins, and users collections in sequence.
   * Enforces scrypt password verification, rate limit tracking, active status,
   * audit logging, and sets an HttpOnly session cookie.
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = loginInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid login credentials payload', parsed.error.issues);
      }

      const { email, password } = parsed.data;
      const normalizedEmail = email.trim().toLowerCase();

      const clientIp = typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : req.ip || req.socket.remoteAddress || null;

      const userAgent = req.headers['user-agent'] || null;

      // ── 1. Check Root Administrator Collection ──
      const rootAdmin = await rootAdminsRepository.findByEmail(normalizedEmail);
      if (rootAdmin) {
        const isPasswordValid = await verifyPassword(password, rootAdmin.passwordHash);
        if (!isPasswordValid) {
          recordFailedLogin(req);
          throw new UnauthorizedError('Invalid email or password');
        }

        if (rootAdmin.status !== 'active') {
          recordFailedLogin(req);
          throw new UnauthorizedError('Root Administrator account is disabled');
        }

        // Check if two-step verification is active for this Root Administrator
        const mfa = await accountMfaRepository.findByAccount(rootAdmin._id, 'root_admin');
        if (mfa && mfa.totpEnabled) {
          recordSuccessfulLogin(req);
          const challengeToken = generateMfaChallengeToken({
            accountId: rootAdmin._id,
            role: 'root_admin',
          });
          await auditLogsRepository.recordEvent({
            eventType: 'mfa.challenge_issued',
            actorId: rootAdmin._id,
            actorRole: 'root_admin',
            targetId: rootAdmin._id,
            action: 'Two-step verification challenge issued after password validation',
            outcome: 'success',
          });
          res.status(200).json({
            data: {
              mfaRequired: true,
              challengeToken,
              role: 'root_admin',
            },
          });
          return;
        }

        recordSuccessfulLogin(req);
        await rootAdminsRepository.updateLastLogin(rootAdmin._id);

        const { token } = await sessionsRepository.createRootAdminSession(rootAdmin._id, {
          ipAddress: clientIp,
          userAgent,
        });

        setSessionCookie(res, token);

        await auditLogsRepository.recordEvent({
          eventType: 'rootadmin.login',
          actorId: rootAdmin._id,
          actorRole: 'root_admin',
          action: 'Root Administrator logged in',
          outcome: 'success',
        });

        res.status(200).json({
          data: {
            user: {
              id: rootAdmin._id,
              email: rootAdmin.email,
              username: rootAdmin.username,
              displayName: rootAdmin.displayName,
              role: 'root_admin',
            },
          },
        });
        return;
      }

      // ── 2. Check Super Administrator Collection ──
      const superAdmin = await superAdminsRepository.findByEmail(normalizedEmail);
      if (superAdmin) {
        const isPasswordValid = await verifyPassword(password, superAdmin.passwordHash);
        if (!isPasswordValid) {
          recordFailedLogin(req);
          throw new UnauthorizedError('Invalid email or password');
        }

        if (superAdmin.status !== 'active') {
          recordFailedLogin(req);
          throw new UnauthorizedError('Administrator account is disabled');
        }

        // Check if two-step verification is active for this Super Administrator
        const mfa = await accountMfaRepository.findByAccount(superAdmin._id, 'superadmin');
        if (mfa && mfa.totpEnabled) {
          recordSuccessfulLogin(req);
          const challengeToken = generateMfaChallengeToken({
            accountId: superAdmin._id,
            role: 'superadmin',
          });
          await auditLogsRepository.recordEvent({
            eventType: 'mfa.challenge_issued',
            actorId: superAdmin._id,
            actorRole: 'superadmin',
            targetId: superAdmin._id,
            action: 'Two-step verification challenge issued after password validation',
            outcome: 'success',
          });
          res.status(200).json({
            data: {
              mfaRequired: true,
              challengeToken,
              role: 'superadmin',
            },
          });
          return;
        }

        recordSuccessfulLogin(req);
        await superAdminsRepository.updateLastLogin(superAdmin._id);

        const { token } = await sessionsRepository.createSuperAdminSession(superAdmin._id, {
          ipAddress: clientIp,
          userAgent,
        });

        setSessionCookie(res, token);

        await auditLogsRepository.recordEvent({
          eventType: 'superadmin.login',
          actorId: superAdmin._id,
          actorRole: 'superadmin',
          action: 'Super Administrator logged in',
          outcome: 'success',
        });

        res.status(200).json({
          data: {
            user: {
              id: superAdmin._id,
              email: superAdmin.email,
              username: superAdmin.username,
              displayName: superAdmin.displayName,
              role: 'superadmin',
            },
          },
        });
        return;
      }

      // ── 3. Check Ordinary Users Collection ──
      const user = await usersRepository.findByEmail(normalizedEmail);
      if (user) {
        const isPasswordValid = await verifyPassword(password, user.passwordHash);
        if (!isPasswordValid) {
          recordFailedLogin(req);
          throw new UnauthorizedError('Invalid email or password');
        }

        if (user.status === 'disabled' || user.status === 'deleted') {
          recordFailedLogin(req);
          throw new UnauthorizedError('User account is disabled or inactive');
        }

        // Check if two-step verification is active for this Ordinary User
        const mfa = await accountMfaRepository.findByAccount(user._id, 'user');
        if (mfa && mfa.totpEnabled) {
          recordSuccessfulLogin(req);
          const challengeToken = generateMfaChallengeToken({
            accountId: user._id,
            role: 'user',
          });
          await auditLogsRepository.recordEvent({
            eventType: 'mfa.challenge_issued',
            actorId: user._id,
            actorRole: 'user',
            targetId: user._id,
            targetType: 'user',
            action: 'Two-step verification challenge issued after password validation',
            outcome: 'success',
          });
          res.status(200).json({
            data: {
              mfaRequired: true,
              challengeToken,
              role: 'user',
            },
          });
          return;
        }

        recordSuccessfulLogin(req);
        await usersRepository.updateLastLogin(user._id);

        const { token } = await sessionsRepository.createUserSession(user._id, {
          ipAddress: clientIp,
          userAgent,
        });

        setSessionCookie(res, token);

        await auditLogsRepository.recordEvent({
          eventType: 'user.login',
          actorId: user._id,
          actorRole: 'user',
          targetId: user._id,
          targetType: 'user',
          action: 'User logged in',
          outcome: 'success',
        });

        res.status(200).json({
          data: {
            user: {
              id: user._id,
              email: user.email,
              username: user.username,
              displayName: user.displayName,
              role: 'user',
              status: user.status,
            },
          },
        });
        return;
      }

      // Generic authentication failure: Do NOT reveal whether email exists
      recordFailedLogin(req);
      throw new UnauthorizedError('Invalid email or password');
    } catch (err) {
      next(err);
    }
  },

  /**
   * Retrieves the current authenticated user profile.
   * Returns safe profile details according to role. Never exposes password hashes or tokens.
   */
  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      if (req.user.role === 'root_admin' && req.user.adminId) {
        const rootAdmin = await rootAdminsRepository.findById(req.user.adminId);
        if (rootAdmin && rootAdmin.status === 'active') {
          res.status(200).json({
            data: {
              user: {
                id: rootAdmin._id,
                email: rootAdmin.email,
                username: rootAdmin.username,
                displayName: rootAdmin.displayName,
                role: 'root_admin',
              },
            },
          });
          return;
        }
      }

      if (req.user.role === 'superadmin' && req.user.adminId) {
        const admin = await superAdminsRepository.findById(req.user.adminId);
        if (admin && admin.status === 'active') {
          res.status(200).json({
            data: {
              user: {
                id: admin._id,
                email: admin.email,
                username: admin.username,
                displayName: admin.displayName,
                role: 'superadmin',
              },
            },
          });
          return;
        }
      }

      if (req.user.role === 'user') {
        const user = await usersRepository.findById(req.user.id);
        if (user && user.status !== 'disabled' && user.status !== 'deleted') {
          res.status(200).json({
            data: {
              user: {
                id: user._id,
                email: user.email,
                username: user.username,
                displayName: user.displayName,
                role: 'user',
                status: user.status,
              },
            },
          });
          return;
        }
      }

      // Fallback for legacy JWT or dev session
      res.status(200).json({
        data: {
          user: {
            id: req.user.id,
            email: req.user.email || 'owner@example.com',
            displayName: req.user.displayName || 'Library Owner',
            role: req.user.role || 'authenticated',
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Logs out the current session across all session types.
   * Server-side revokes the active session and clears the browser cookie.
   */
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = getCookie(req, SESSION_COOKIE_NAME);
      if (token) {
        await sessionsRepository.revokeSession(token);
      }

      if (req.user) {
        await auditLogsRepository.recordEvent({
          eventType: `${req.user.role || 'user'}.logout`,
          actorId: req.user.id,
          actorRole: (req.user.role as any) || 'user',
          action: 'Logged out session',
          outcome: 'success',
        });
      }

      clearSessionCookie(res);

      res.status(200).json({
        data: {
          message: 'Logged out successfully',
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Development-only session endpoint (strictly disabled in production).
   */
  getDevSession(req: Request, res: Response, next: NextFunction): void {
    try {
      const isDevAuthEnabled =
        config.NODE_ENV !== 'production' &&
        (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') &&
        config.ENABLE_DEV_AUTH !== false;

      if (!isDevAuthEnabled) {
        throw new NotFoundError('The requested API endpoint does not exist');
      }

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
