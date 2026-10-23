import type { Request, Response, NextFunction } from 'express';
import { generateSecret, generateURI, verify as verifyOtp } from 'otplib';
import QRCode from 'qrcode';
import {
  mfaSetupInputSchema,
  mfaVerifySetupInputSchema,
  mfaChallengeVerifyInputSchema,
  mfaDisableInputSchema,
  mfaRegenerateRecoveryInputSchema,
} from '@animemanager/shared';
import { BadRequestError, UnauthorizedError, NotFoundError } from '../errors/index.js';
import { verifyPassword } from '../utils/password.js';
import { setSessionCookie } from '../utils/cookie.js';
import {
  encryptTotpSecret,
  decryptTotpSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyMfaChallengeToken,
} from '../utils/mfa-crypto.js';
import { accountMfaRepository } from '../repositories/account-mfa.repository.js';
import { rootAdminsRepository } from '../repositories/root-admins.repository.js';
import { superAdminsRepository } from '../repositories/super-admins.repository.js';
import { usersRepository } from '../repositories/users.repository.js';
import { sessionsRepository } from '../repositories/sessions.repository.js';
import { auditLogsRepository } from '../repositories/audit-logs.repository.js';

/**
 * Helper to verify an account's password given their id and role.
 */
async function verifyAccountPassword(accountId: string, role: string, plainPassword: string): Promise<boolean> {
  if (role === 'root_admin') {
    const admin = await rootAdminsRepository.findById(accountId);
    if (!admin || admin.status !== 'active') return false;
    return verifyPassword(plainPassword, admin.passwordHash);
  }
  if (role === 'superadmin') {
    const admin = await superAdminsRepository.findById(accountId);
    if (!admin || admin.status !== 'active') return false;
    return verifyPassword(plainPassword, admin.passwordHash);
  }
  if (role === 'user') {
    const user = await usersRepository.findById(accountId);
    if (!user || user.status === 'disabled' || user.status === 'deleted') return false;
    return verifyPassword(plainPassword, user.passwordHash);
  }
  return false;
}

export const mfaController = {
  /**
   * Retrieves the current account's non-sensitive MFA status.
   * Never exposes secrets, pending secrets, or recovery code hashes.
   */
  async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const mfa = await accountMfaRepository.findByAccount(
        req.user.id,
        req.user.role as 'user' | 'superadmin' | 'root_admin'
      );

      res.status(200).json({
        data: {
          enabled: Boolean(mfa?.totpEnabled),
          enrolledAt: mfa?.enrolledAt ? mfa.enrolledAt.toISOString() : null,
          recoveryCodesRemaining: mfa?.recoveryCodeHashes ? mfa.recoveryCodeHashes.length : 0,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Begins authenticated TOTP enrollment.
   * Requires password confirmation.
   * Generates a pending encrypted secret, standard otpauth:// URI, and QR data URL.
   */
  async setup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const parsed = mfaSetupInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid setup request payload', parsed.error.issues);
      }

      const userRole = req.user.role || 'user';
      const isPasswordValid = await verifyAccountPassword(
        req.user.id,
        userRole,
        parsed.data.password
      );

      if (!isPasswordValid) {
        throw new UnauthorizedError('Incorrect password. Password confirmation is required to setup 2FA.');
      }

      // Generate 160-bit Base32 secret
      const plainSecret = generateSecret();
      const pendingEncryptedTotpSecret = encryptTotpSecret(plainSecret);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await accountMfaRepository.startPendingSetup({
        accountId: req.user.id,
        accountRole: req.user.role as 'user' | 'superadmin' | 'root_admin',
        pendingEncryptedTotpSecret,
        expiresAt,
      });

      const userEmail = req.user.email || 'user@animemanager.local';
      const otpauthUri = generateURI({
        issuer: 'AnimeManager',
        label: userEmail,
        secret: plainSecret,
      });

      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri, {
        errorCorrectionLevel: 'M',
        width: 256,
        margin: 2,
      });

      await auditLogsRepository.recordEvent({
        eventType: 'mfa.enrollment_started',
        actorId: req.user.id,
        actorRole: req.user.role as any,
        targetId: req.user.id,
        targetType: req.user.role === 'user' ? 'user' : req.user.role === 'superadmin' ? 'superadmin' : 'root_admin',
        action: 'Initiated two-step verification enrollment',
        outcome: 'success',
      });

      res.status(200).json({
        data: {
          qrCodeDataUrl,
          manualEntryKey: plainSecret,
          expiresAt: expiresAt.toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Verifies the setup code against the pending secret.
   * On success, promotes the pending secret to active, generates 8 recovery codes,
   * activates totpEnabled, and returns the recovery codes to be displayed ONCE.
   */
  async verifySetup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const parsed = mfaVerifySetupInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid verification code payload', parsed.error.issues);
      }

      const mfa = await accountMfaRepository.findByAccount(
        req.user.id,
        req.user.role as 'user' | 'superadmin' | 'root_admin'
      );

      if (!mfa || !mfa.pendingEncryptedTotpSecret || !mfa.pendingSetupExpiresAt) {
        throw new BadRequestError('No pending two-step verification setup found. Please initiate setup again.');
      }

      if (new Date() > mfa.pendingSetupExpiresAt) {
        throw new BadRequestError('Two-step verification setup has expired. Please initiate setup again.');
      }

      const plainSecret = decryptTotpSecret(mfa.pendingEncryptedTotpSecret);
      const result = await verifyOtp({
        secret: plainSecret,
        token: parsed.data.code,
        epochTolerance: 30,
      });

      if (!result.valid) {
        await auditLogsRepository.recordEvent({
          eventType: 'mfa.enrollment_failed',
          actorId: req.user.id,
          actorRole: req.user.role as any,
          targetId: req.user.id,
          action: 'Failed two-step verification enrollment attempt (invalid OTP)',
          outcome: 'failure',
        });
        throw new BadRequestError('Invalid verification code. Please check your authenticator app and try again.');
      }

      // Generate 8 single-use recovery codes
      const { plainCodes, hashedCodes } = generateRecoveryCodes(8);

      await accountMfaRepository.confirmSetup({
        accountId: req.user.id,
        accountRole: req.user.role as 'user' | 'superadmin' | 'root_admin',
        encryptedTotpSecret: mfa.pendingEncryptedTotpSecret,
        recoveryCodeHashes: hashedCodes,
        timeStep: (result as any).timeStep || 0,
      });

      await auditLogsRepository.recordEvent({
        eventType: 'mfa.enrollment_completed',
        actorId: req.user.id,
        actorRole: req.user.role as any,
        targetId: req.user.id,
        targetType: req.user.role === 'user' ? 'user' : req.user.role === 'superadmin' ? 'superadmin' : 'root_admin',
        action: 'Completed two-step verification enrollment',
        outcome: 'success',
      });

      res.status(200).json({
        data: {
          success: true,
          recoveryCodes: plainCodes,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Securely disables two-step verification.
   * Requires password confirmation + valid OTP (or recovery code).
   */
  async disable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const parsed = mfaDisableInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid disable request payload', parsed.error.issues);
      }

      const userRole = req.user.role || 'user';
      const isPasswordValid = await verifyAccountPassword(
        req.user.id,
        userRole,
        parsed.data.password
      );

      if (!isPasswordValid) {
        throw new UnauthorizedError('Incorrect password. Password confirmation is required to disable 2FA.');
      }

      const mfa = await accountMfaRepository.findByAccount(
        req.user.id,
        req.user.role as 'user' | 'superadmin' | 'root_admin'
      );

      if (!mfa || !mfa.totpEnabled || !mfa.encryptedTotpSecret) {
        throw new BadRequestError('Two-step verification is not currently enabled for this account.');
      }

      // Verify either OTP code or recovery code
      const submittedCode = parsed.data.code.trim();
      let verified = false;

      // Check if it's a 6-digit OTP
      if (/^[0-9]{6}$/.test(submittedCode)) {
        const plainSecret = decryptTotpSecret(mfa.encryptedTotpSecret);
        const result = await verifyOtp({
          secret: plainSecret,
          token: submittedCode,
          epochTolerance: 30,
        });
        if (result.valid) {
          verified = true;
        }
      }

      // If not verified as OTP, check if it's a recovery code
      if (!verified && mfa.recoveryCodeHashes && mfa.recoveryCodeHashes.length > 0) {
        try {
          const hashed = hashRecoveryCode(submittedCode);
          if (mfa.recoveryCodeHashes.includes(hashed)) {
            verified = true;
          }
        } catch {
          // not a valid recovery code format
        }
      }

      if (!verified) {
        throw new UnauthorizedError('Invalid verification code or recovery code.');
      }

      await accountMfaRepository.disable(
        req.user.id,
        req.user.role as 'user' | 'superadmin' | 'root_admin'
      );

      await auditLogsRepository.recordEvent({
        eventType: 'mfa.disabled',
        actorId: req.user.id,
        actorRole: req.user.role as any,
        targetId: req.user.id,
        targetType: req.user.role === 'user' ? 'user' : req.user.role === 'superadmin' ? 'superadmin' : 'root_admin',
        action: 'Disabled two-step verification',
        outcome: 'success',
      });

      res.status(200).json({
        data: {
          message: 'Two-step verification has been disabled successfully.',
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Regenerates recovery codes.
   * Requires password confirmation + valid OTP code.
   */
  async regenerateRecoveryCodes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const parsed = mfaRegenerateRecoveryInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid request payload', parsed.error.issues);
      }

      const userRole = req.user.role || 'user';
      const isPasswordValid = await verifyAccountPassword(
        req.user.id,
        userRole,
        parsed.data.password
      );

      if (!isPasswordValid) {
        throw new UnauthorizedError('Incorrect password. Password confirmation is required to regenerate recovery codes.');
      }

      const mfa = await accountMfaRepository.findByAccount(
        req.user.id,
        req.user.role as 'user' | 'superadmin' | 'root_admin'
      );

      if (!mfa || !mfa.totpEnabled || !mfa.encryptedTotpSecret) {
        throw new BadRequestError('Two-step verification is not currently enabled for this account.');
      }

      const plainSecret = decryptTotpSecret(mfa.encryptedTotpSecret);
      const result = await verifyOtp({
        secret: plainSecret,
        token: parsed.data.code,
        epochTolerance: 30,
      });

      if (!result.valid) {
        throw new UnauthorizedError('Invalid verification code.');
      }

      const { plainCodes, hashedCodes } = generateRecoveryCodes(8);

      await accountMfaRepository.regenerateRecoveryCodes(
        req.user.id,
        req.user.role as 'user' | 'superadmin' | 'root_admin',
        hashedCodes
      );

      await auditLogsRepository.recordEvent({
        eventType: 'mfa.recovery_codes_regenerated',
        actorId: req.user.id,
        actorRole: req.user.role as any,
        targetId: req.user.id,
        action: 'Regenerated recovery codes',
        outcome: 'success',
      });

      res.status(200).json({
        data: {
          success: true,
          recoveryCodes: plainCodes,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Verifies an MFA challenge token during login.
   * Accepts either a 6-digit TOTP code or a single-use recovery code.
   * On success, establishes the ambient session cookie and returns user profile.
   */
  async challengeVerify(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = mfaChallengeVerifyInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid MFA verification payload', parsed.error.issues);
      }

      const { accountId, role } = verifyMfaChallengeToken(parsed.data.challengeToken);
      const mfa = await accountMfaRepository.findByAccount(
        accountId,
        role as 'user' | 'superadmin' | 'root_admin'
      );

      if (!mfa || !mfa.totpEnabled || !mfa.encryptedTotpSecret) {
        throw new BadRequestError('Two-step verification is not active for this account.');
      }

      const submittedCode = parsed.data.code.trim();
      let verified = false;
      let usedRecoveryCode = false;

      // Check if it is a 6-digit numeric OTP code
      if (/^[0-9]{6}$/.test(submittedCode)) {
        const plainSecret = decryptTotpSecret(mfa.encryptedTotpSecret);
        const result = await verifyOtp({
          secret: plainSecret,
          token: submittedCode,
          epochTolerance: 30,
        });

        if (result.valid) {
          const timeStep = (result as any).timeStep || 0;
          // Replay protection: Reject if timeStep <= lastUsedTimeStep
          if (mfa.lastUsedTimeStep && timeStep <= mfa.lastUsedTimeStep) {
            throw new UnauthorizedError(
              'This verification code has already been used. Please wait for your authenticator app to generate a new code.'
            );
          }

          await accountMfaRepository.updateLastUsedTimeStep(
            accountId,
            role as 'user' | 'superadmin' | 'root_admin',
            timeStep
          );
          verified = true;
        }
      }

      // If not verified as OTP, check if it's a recovery code
      if (!verified) {
        try {
          const hashed = hashRecoveryCode(submittedCode);
          const consumed = await accountMfaRepository.consumeRecoveryCode(
            accountId,
            role as 'user' | 'superadmin' | 'root_admin',
            hashed
          );
          if (consumed) {
            verified = true;
            usedRecoveryCode = true;
            await auditLogsRepository.recordEvent({
              eventType: 'mfa.recovery_code_used',
              actorId: accountId,
              actorRole: role as any,
              targetId: accountId,
              action: 'Authenticated using single-use recovery code',
              outcome: 'success',
            });
          }
        } catch {
          // not a valid recovery code format
        }
      }

      if (!verified) {
        await auditLogsRepository.recordEvent({
          eventType: 'mfa.verification_failed',
          actorId: accountId,
          actorRole: role as any,
          targetId: accountId,
          action: 'Failed two-step verification attempt during login',
          outcome: 'failure',
        });
        throw new UnauthorizedError('Invalid verification code or recovery code.');
      }

      // Verification successful! Establish ambient session cookie for the verified role
      const clientIp = typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : req.ip || req.socket.remoteAddress || null;
      const userAgent = req.headers['user-agent'] || null;

      if (role === 'root_admin') {
        const rootAdmin = await rootAdminsRepository.findById(accountId);
        if (!rootAdmin || rootAdmin.status !== 'active') {
          throw new UnauthorizedError('Root Administrator account is inactive or revoked');
        }
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
          action: `Root Administrator logged in (${usedRecoveryCode ? 'Recovery Code' : 'TOTP Verified'})`,
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

      if (role === 'superadmin') {
        const superAdmin = await superAdminsRepository.findById(accountId);
        if (!superAdmin || superAdmin.status !== 'active') {
          throw new UnauthorizedError('Administrator account is inactive or revoked');
        }
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
          action: `Super Administrator logged in (${usedRecoveryCode ? 'Recovery Code' : 'TOTP Verified'})`,
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

      if (role === 'user') {
        const user = await usersRepository.findById(accountId);
        if (!user || user.status === 'disabled' || user.status === 'deleted') {
          throw new UnauthorizedError('User account is inactive or disabled');
        }
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
          action: `User logged in (${usedRecoveryCode ? 'Recovery Code' : 'TOTP Verified'})`,
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

      throw new UnauthorizedError('Invalid account role');
    } catch (err) {
      next(err);
    }
  },
};
