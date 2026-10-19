import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../errors/index.js';
import { rootAdminsRepository } from '../repositories/root-admins.repository.js';
import { superAdminsRepository } from '../repositories/super-admins.repository.js';

/**
 * Strict server-side authorization middleware for Root Administrator operations.
 * Allows ONLY authenticated, active 'root_admin' accounts.
 * Required for: Creating Super Admins, activating/disabling/deleting Super Admins,
 * revoking Super Admin sessions, and viewing detailed administrative audit logs.
 */
export async function requireRootAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (req.user.role !== 'root_admin' || !req.user.adminId) {
      throw new ForbiddenError('Root Administrator privileges required');
    }

    const rootAdmin = await rootAdminsRepository.findById(req.user.adminId);
    if (!rootAdmin || rootAdmin.status !== 'active') {
      throw new ForbiddenError('Root Administrator account is disabled or revoked');
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Server-side authorization middleware allowing either Root Administrator or Super Admin.
 * Used for: Managing ordinary Users, updating User statuses, revoking User sessions,
 * and viewing privacy-preserving User activity.
 */
export async function requireSuperAdminOrRoot(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (req.user.role === 'root_admin' && req.user.adminId) {
      const rootAdmin = await rootAdminsRepository.findById(req.user.adminId);
      if (!rootAdmin || rootAdmin.status !== 'active') {
        throw new ForbiddenError('Root Administrator account is disabled or revoked');
      }
      return next();
    }

    if (req.user.role === 'superadmin' && req.user.adminId) {
      const admin = await superAdminsRepository.findById(req.user.adminId);
      if (!admin || admin.status !== 'active') {
        throw new ForbiddenError('Super Administrator account is disabled or revoked');
      }
      return next();
    }

    throw new ForbiddenError('Administrative privileges required');
  } catch (err) {
    next(err);
  }
}

/**
 * Server-side authorization middleware allowing ONLY Super Admins (not Root Admin).
 * Used when enforcing strict separation where Root Admins have their own portal.
 */
export async function requireSuperAdminOnly(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (req.user.role !== 'superadmin' || !req.user.adminId) {
      throw new ForbiddenError('Super Administrator privileges required');
    }

    const admin = await superAdminsRepository.findById(req.user.adminId);
    if (!admin || admin.status !== 'active') {
      throw new ForbiddenError('Super Administrator account is disabled or revoked');
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Backward compatibility alias
 */
export const requireSuperAdmin = requireSuperAdminOrRoot;
