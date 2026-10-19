import type { Request, Response, NextFunction } from 'express';
import {
  createSuperAdminSchema,
  updateSuperAdminStatusSchema,
  updateUserStatusSchema,
} from '@animemanager/shared';
import {
  BadRequestError,
  NotFoundError,
  DuplicateResourceError,
  ForbiddenError,
} from '../errors/index.js';
import { rootAdminsRepository } from '../repositories/root-admins.repository.js';
import { superAdminsRepository } from '../repositories/super-admins.repository.js';
import { usersRepository } from '../repositories/users.repository.js';
import { sessionsRepository } from '../repositories/sessions.repository.js';
import { auditLogsRepository } from '../repositories/audit-logs.repository.js';
import {
  getTitlesCollection,
  getBookmarksCollection,
  getCollectionsCollection,
} from '../repositories/mongo.js';
import { hashPassword } from '../utils/password.js';
import { CANONICAL_OWNER_ID } from '../middleware/auth.middleware.js';

export const adminController = {
  // ── ROOT ADMINISTRATOR ONLY: Super Admin Management ──────────────────

  /**
   * Lists all Super Administrator accounts.
   * Accessible ONLY to Root Administrator. Never returns password hashes.
   */
  async listSuperAdmins(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const admins = await superAdminsRepository.listAll();
      res.status(200).json({
        data: admins.map((a) => ({
          id: a._id,
          email: a.email,
          username: a.username,
          displayName: a.displayName,
          role: 'superadmin',
          status: a.status,
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
          lastLoginAt: a.lastLoginAt ? a.lastLoginAt.toISOString() : null,
        })),
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Creates a new Super Administrator account.
   * Accessible ONLY to Root Administrator.
   *
   * CRITICAL SECURITY INVARIANT:
   * New Super Admin accounts are ALWAYS created with status: 'disabled' by default
   * and cannot self-activate.
   */
  async createSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = createSuperAdminSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid administrator registration payload', parsed.error.issues);
      }

      const { email, displayName, password, username } = parsed.data;
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedUsername = username ? username.trim().toLowerCase() : undefined;

      // Enforce email uniqueness
      const existingEmail = await superAdminsRepository.findByEmail(normalizedEmail);
      if (existingEmail) {
        throw new DuplicateResourceError(`Administrator with email "${normalizedEmail}" already exists`);
      }

      if (normalizedUsername) {
        const existingUsername = await superAdminsRepository.findByUsername(normalizedUsername);
        if (existingUsername) {
          throw new DuplicateResourceError(`Administrator with username "${normalizedUsername}" already exists`);
        }
      }

      const passwordHash = await hashPassword(password);

      // Force status to disabled regardless of client inputs
      const created = await superAdminsRepository.create({
        email: normalizedEmail,
        username: normalizedUsername,
        displayName: displayName.trim(),
        passwordHash,
        status: 'disabled',
      });

      // Record administrative audit event
      await auditLogsRepository.recordEvent({
        eventType: 'superadmin.created',
        actorId: req.user!.id,
        actorRole: 'root_admin',
        targetId: created._id,
        targetType: 'superadmin',
        action: `Root Administrator created Super Admin "${created.email}"`,
        outcome: 'success',
        metadata: { email: created.email, displayName: created.displayName },
      });

      res.status(201).json({
        data: {
          id: created._id,
          email: created.email,
          username: created.username,
          displayName: created.displayName,
          role: 'superadmin',
          status: created.status,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
          lastLoginAt: null,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Activates or disables a Super Administrator account.
   * Accessible ONLY to Root Administrator.
   *
   * Safeguards:
   * 1. Target admin must exist.
   * 2. Cannot disable own administrator account.
   * 3. Cannot disable the final active Super Admin account.
   * 4. When an account is disabled, all active sessions are immediately revoked.
   */
  async updateSuperAdminStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!id || typeof id !== 'string') {
        throw new BadRequestError('Administrator ID is required');
      }

      const parsed = updateSuperAdminStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid administrator status payload', parsed.error.issues);
      }

      const { status } = parsed.data;

      const target = await superAdminsRepository.findById(id);
      if (!target) {
        throw new NotFoundError(`Super Administrator account "${id}" not found`);
      }

      // Safeguard 1: Prevent disabling own account
      if (req.user?.adminId === id && status === 'disabled') {
        throw new BadRequestError('You cannot disable your own administrator account');
      }

      // Safeguard 2: Prevent disabling the final active administrator
      if (status === 'disabled' && target.status === 'active') {
        const activeCount = await superAdminsRepository.countActive();
        if (activeCount <= 1) {
          throw new BadRequestError('Cannot disable the final active Super Administrator account');
        }
      }

      const updated = await superAdminsRepository.updateStatus(id, status);
      if (!updated) {
        throw new NotFoundError(`Super Administrator account "${id}" not found`);
      }

      // Immediate session revocation on disablement
      if (status === 'disabled') {
        await sessionsRepository.revokeAllForSuperAdmin(id);
      }

      await auditLogsRepository.recordEvent({
        eventType: 'superadmin.status_changed',
        actorId: req.user!.id,
        actorRole: 'root_admin',
        targetId: target._id,
        targetType: 'superadmin',
        action: `Super Admin "${target.email}" status changed to "${status}"`,
        outcome: 'success',
        metadata: { previousStatus: target.status, newStatus: status },
      });

      res.status(200).json({
        data: {
          id: updated._id,
          email: updated.email,
          username: updated.username,
          displayName: updated.displayName,
          role: 'superadmin',
          status: updated.status,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
          lastLoginAt: updated.lastLoginAt ? updated.lastLoginAt.toISOString() : null,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Deletes a Super Administrator account.
   * Accessible ONLY to Root Administrator.
   */
  async deleteSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!id || typeof id !== 'string') {
        throw new BadRequestError('Administrator ID is required');
      }

      const target = await superAdminsRepository.findById(id);
      if (!target) {
        throw new NotFoundError(`Super Administrator account "${id}" not found`);
      }

      // Cannot delete self
      if (req.user?.adminId === id) {
        throw new BadRequestError('You cannot delete your own administrator account');
      }

      await superAdminsRepository.delete(id);
      await sessionsRepository.revokeAllForSuperAdmin(id);

      await auditLogsRepository.recordEvent({
        eventType: 'superadmin.deleted',
        actorId: req.user!.id,
        actorRole: 'root_admin',
        targetId: id,
        targetType: 'superadmin',
        action: `Deleted Super Admin account "${target.email}"`,
        outcome: 'success',
      });

      res.status(200).json({
        data: {
          message: `Super Administrator "${target.email}" has been deleted`,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Revokes all active sessions for a specific Super Administrator.
   * Accessible ONLY to Root Administrator.
   */
  async revokeSuperAdminSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!id || typeof id !== 'string') {
        throw new BadRequestError('Administrator ID is required');
      }

      const target = await superAdminsRepository.findById(id);
      if (!target) {
        throw new NotFoundError(`Super Administrator account "${id}" not found`);
      }

      await sessionsRepository.revokeAllForSuperAdmin(id);

      await auditLogsRepository.recordEvent({
        eventType: 'superadmin.session_revoked',
        actorId: req.user!.id,
        actorRole: 'root_admin',
        targetId: id,
        targetType: 'superadmin',
        action: `Revoked all active sessions for Super Admin "${target.email}"`,
        outcome: 'success',
      });

      res.status(200).json({
        data: {
          message: `All active sessions for administrator "${target.email}" have been revoked`,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Returns all audit log events with optional filtering.
   * Accessible ONLY to Root Administrator.
   */
  async getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { targetType, actorRole, eventType, limit, offset } = req.query;
      const result = await auditLogsRepository.listEvents({
        targetType: typeof targetType === 'string' ? targetType : undefined,
        actorRole: typeof actorRole === 'string' ? actorRole : undefined,
        eventType: typeof eventType === 'string' ? eventType : undefined,
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0,
      });

      res.status(200).json({
        data: result.items.map((item) => ({
          id: item._id,
          eventType: item.eventType,
          actorId: item.actorId,
          actorRole: item.actorRole,
          targetId: item.targetId,
          targetType: item.targetType,
          action: item.action,
          outcome: item.outcome,
          metadata: item.metadata,
          timestamp: item.timestamp.toISOString(),
        })),
        pagination: {
          total: result.total,
          limit: limit ? Number(limit) : 50,
          offset: offset ? Number(offset) : 0,
        },
        earliestHistory: result.earliestHistory ? result.earliestHistory.toISOString() : null,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Returns comprehensive system-wide metrics.
   * Accessible ONLY to Root Administrator.
   */
  async getSystemStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const [titlesColl, bookmarksColl, collectionsColl] = await Promise.all([
        getTitlesCollection(),
        getBookmarksCollection(),
        getCollectionsCollection(),
      ]);

      const [
        rootAdminsCount,
        superAdminsTotal,
        superAdminsActive,
        usersTotal,
        usersActive,
        usersRestricted,
        usersDisabled,
        totalTitles,
        totalBookmarks,
        totalCollections,
        totalAuditEvents,
      ] = await Promise.all([
        rootAdminsRepository.countActive(),
        superAdminsRepository.count(),
        superAdminsRepository.countActive(),
        usersRepository.countTotal(),
        usersRepository.countByStatus('active'),
        usersRepository.countByStatus('restricted'),
        usersRepository.countByStatus('disabled'),
        titlesColl.countDocuments({}),
        bookmarksColl.countDocuments({}),
        collectionsColl.countDocuments({}),
        auditLogsRepository.countTotal(),
      ]);

      res.status(200).json({
        data: {
          rootAdminsCount,
          superAdmins: {
            total: superAdminsTotal,
            active: superAdminsActive,
            disabled: superAdminsTotal - superAdminsActive,
          },
          users: {
            total: usersTotal,
            active: usersActive,
            restricted: usersRestricted,
            disabled: usersDisabled,
          },
          library: {
            totalTitles,
            totalBookmarks,
            totalCollections,
          },
          totalAuditEvents,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // ── ROOT ADMIN & SUPER ADMIN: Ordinary Users Management ───────────────

  /**
   * Lists ordinary users managed by the application.
   * Returns real users from users collection, plus canonical library owner.
   */
  async listUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const [titlesColl, bookmarksColl, collectionsColl, usersList] = await Promise.all([
        getTitlesCollection(),
        getBookmarksCollection(),
        getCollectionsCollection(),
        usersRepository.listAll(),
      ]);

      // Count canonical owner data
      const [canonicalTitles, canonicalBookmarks, canonicalCollections] = await Promise.all([
        titlesColl.countDocuments({ ownerId: CANONICAL_OWNER_ID }),
        bookmarksColl.countDocuments({ ownerId: CANONICAL_OWNER_ID }),
        collectionsColl.countDocuments({ ownerId: CANONICAL_OWNER_ID }),
      ]);

      // Calculate counts for registered ordinary users in parallel
      const managedUsers = await Promise.all(
        usersList.map(async (u) => {
          const [titlesCount, bookmarksCount, collectionsCount] = await Promise.all([
            titlesColl.countDocuments({ ownerId: u._id }),
            bookmarksColl.countDocuments({ ownerId: u._id }),
            collectionsColl.countDocuments({ ownerId: u._id }),
          ]);

          return {
            id: u._id,
            username: u.username,
            email: u.email,
            displayName: u.displayName,
            role: 'user' as const,
            status: u.status,
            createdAt: u.createdAt.toISOString(),
            updatedAt: u.updatedAt.toISOString(),
            lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
            titlesCount,
            bookmarksCount,
            collectionsCount,
          };
        })
      );

      // Canonical owner entry
      const canonicalEntry = {
        id: CANONICAL_OWNER_ID,
        username: 'canonical_owner',
        email: 'owner@example.com',
        displayName: 'Library Owner',
        role: 'owner' as const,
        status: 'active' as const,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        lastLoginAt: null,
        titlesCount: canonicalTitles,
        bookmarksCount: canonicalBookmarks,
        collectionsCount: canonicalCollections,
      };

      res.status(200).json({
        data: [canonicalEntry, ...managedUsers],
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Retrieves safe profile details for a specific user.
   */
  async getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (id === CANONICAL_OWNER_ID) {
        const [titlesColl, bookmarksColl, collectionsColl] = await Promise.all([
          getTitlesCollection(),
          getBookmarksCollection(),
          getCollectionsCollection(),
        ]);
        const [titlesCount, bookmarksCount, collectionsCount] = await Promise.all([
          titlesColl.countDocuments({ ownerId: CANONICAL_OWNER_ID }),
          bookmarksColl.countDocuments({ ownerId: CANONICAL_OWNER_ID }),
          collectionsColl.countDocuments({ ownerId: CANONICAL_OWNER_ID }),
        ]);

        res.status(200).json({
          data: {
            id: CANONICAL_OWNER_ID,
            username: 'canonical_owner',
            email: 'owner@example.com',
            displayName: 'Library Owner',
            role: 'owner',
            status: 'active',
            createdAt: '2026-10-01T00:00:00.000Z',
            titlesCount,
            bookmarksCount,
            collectionsCount,
          },
        });
        return;
      }

      const user = await usersRepository.findById(id);
      if (!user) {
        throw new NotFoundError(`User "${id}" not found`);
      }

      const [titlesColl, bookmarksColl, collectionsColl] = await Promise.all([
        getTitlesCollection(),
        getBookmarksCollection(),
        getCollectionsCollection(),
      ]);

      const [titlesCount, bookmarksCount, collectionsCount] = await Promise.all([
        titlesColl.countDocuments({ ownerId: user._id }),
        bookmarksColl.countDocuments({ ownerId: user._id }),
        collectionsColl.countDocuments({ ownerId: user._id }),
      ]);

      res.status(200).json({
        data: {
          id: user._id,
          username: user.username,
          email: user.email,
          displayName: user.displayName,
          role: 'user',
          status: user.status,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
          lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
          titlesCount,
          bookmarksCount,
          collectionsCount,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Updates an ordinary user's status ('active' | 'restricted' | 'disabled' | 'deleted').
   * Disabling or deleting an account immediately revokes all of its active sessions.
   */
  async updateUserStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (id === CANONICAL_OWNER_ID) {
        throw new BadRequestError('Cannot modify status of canonical library owner');
      }

      const parsed = updateUserStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid user status payload', parsed.error.issues);
      }

      const { status, reason } = parsed.data;

      const user = await usersRepository.findById(id);
      if (!user) {
        throw new NotFoundError(`User "${id}" not found`);
      }

      await usersRepository.updateStatus(id, status);

      // Invalidate active sessions if account is no longer active
      if (status !== 'active') {
        await sessionsRepository.revokeAllForUser(id);
      }

      await auditLogsRepository.recordEvent({
        eventType: 'user.status_changed',
        actorId: req.user!.id,
        actorRole: (req.user!.role as any) || 'superadmin',
        targetId: user._id,
        targetType: 'user',
        action: `User "${user.username}" status updated to "${status}"`,
        outcome: 'success',
        metadata: { previousStatus: user.status, newStatus: status, reason },
      });

      res.status(200).json({
        data: {
          id: user._id,
          username: user.username,
          email: user.email,
          displayName: user.displayName,
          status,
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Deletes a user account (soft delete by default, revoking sessions).
   */
  async deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (id === CANONICAL_OWNER_ID) {
        throw new BadRequestError('Cannot delete canonical library owner');
      }

      const user = await usersRepository.findById(id);
      if (!user) {
        throw new NotFoundError(`User "${id}" not found`);
      }

      await usersRepository.delete(id, false); // soft deletion sets status: 'deleted'
      await sessionsRepository.revokeAllForUser(id);

      await auditLogsRepository.recordEvent({
        eventType: 'user.deleted',
        actorId: req.user!.id,
        actorRole: (req.user!.role as any) || 'superadmin',
        targetId: id,
        targetType: 'user',
        action: `Deleted User account "${user.username}"`,
        outcome: 'success',
      });

      res.status(200).json({
        data: {
          message: `User "${user.username}" has been deleted`,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Revokes all active sessions for a specific ordinary user.
   */
  async revokeUserSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = await usersRepository.findById(id);
      if (!user) {
        throw new NotFoundError(`User "${id}" not found`);
      }

      await sessionsRepository.revokeAllForUser(id);

      await auditLogsRepository.recordEvent({
        eventType: 'user.session_revoked',
        actorId: req.user!.id,
        actorRole: (req.user!.role as any) || 'superadmin',
        targetId: id,
        targetType: 'user',
        action: `Revoked all active sessions for User "${user.username}"`,
        outcome: 'success',
      });

      res.status(200).json({
        data: {
          message: `All active sessions for user "${user.username}" have been revoked`,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Returns privacy-preserving activity feed for ordinary users.
   * Strictly omits private library titles, synopsis, ratings, etc.
   */
  async getUserActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { limit, offset } = req.query;
      const result = await auditLogsRepository.listUserActivity(
        limit ? Number(limit) : 50,
        offset ? Number(offset) : 0
      );

      res.status(200).json({
        data: result.items.map((item) => ({
          id: item._id,
          eventType: item.eventType,
          actorId: item.actorId,
          targetId: item.targetId,
          action: item.action,
          outcome: item.outcome,
          metadata: item.metadata,
          timestamp: item.timestamp.toISOString(),
        })),
        pagination: {
          total: result.total,
          limit: limit ? Number(limit) : 50,
          offset: offset ? Number(offset) : 0,
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
