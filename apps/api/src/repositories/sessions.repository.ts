import crypto from 'node:crypto';
import {
  getRootAdminSessionsCollection,
  getSuperAdminSessionsCollection,
  getUserSessionsCollection,
  type RootAdminSessionDocument,
  type SuperAdminSessionDocument,
  type UserSessionDocument,
} from './mongo.js';
import { generateSessionToken, hashSessionToken } from '../utils/password.js';
import type { AuthRole } from '@animemanager/shared';

export interface CreateSessionParams {
  adminId?: string;
  rootAdminId?: string;
  userId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  ttlDays?: number;
}

export interface ValidSessionResult {
  _id: string;
  sessionTokenHash: string;
  role: 'root_admin' | 'superadmin' | 'user';
  accountId: string;
  adminId?: string;
  rootAdminId?: string;
  userId?: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export const sessionsRepository = {
  /**
   * Root Administrator Session Creation
   */
  async createRootAdminSession(rootAdminId: string, meta: { ipAddress?: string | null; userAgent?: string | null; ttlDays?: number } = {}) {
    const rawToken = generateSessionToken();
    const sessionTokenHash = hashSessionToken(rawToken);
    const ttlDays = meta.ttlDays ?? 7;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    const doc: RootAdminSessionDocument = {
      _id: crypto.randomUUID(),
      sessionTokenHash,
      rootAdminId,
      createdAt: now,
      expiresAt,
      revokedAt: null,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    };

    const collection = await getRootAdminSessionsCollection();
    await collection.insertOne(doc);

    return { token: rawToken, session: doc };
  },

  /**
   * Super Administrator Session Creation (also aliased as createSession for backward compatibility)
   */
  async createSuperAdminSession(adminId: string, meta: { ipAddress?: string | null; userAgent?: string | null; ttlDays?: number } = {}) {
    const rawToken = generateSessionToken();
    const sessionTokenHash = hashSessionToken(rawToken);
    const ttlDays = meta.ttlDays ?? 7;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    const doc: SuperAdminSessionDocument = {
      _id: crypto.randomUUID(),
      sessionTokenHash,
      adminId,
      createdAt: now,
      expiresAt,
      revokedAt: null,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    };

    const collection = await getSuperAdminSessionsCollection();
    await collection.insertOne(doc);

    return { token: rawToken, session: doc };
  },

  /**
   * Backward compatibility alias for Super Admin session creation
   */
  async createSession(params: CreateSessionParams): Promise<{ token: string; session: SuperAdminSessionDocument }> {
    const adminId = params.adminId || params.rootAdminId || params.userId!;
    return this.createSuperAdminSession(adminId, {
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      ttlDays: params.ttlDays,
    });
  },

  /**
   * Ordinary User Session Creation
   */
  async createUserSession(userId: string, meta: { ipAddress?: string | null; userAgent?: string | null; ttlDays?: number } = {}) {
    const rawToken = generateSessionToken();
    const sessionTokenHash = hashSessionToken(rawToken);
    const ttlDays = meta.ttlDays ?? 7;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    const doc: UserSessionDocument = {
      _id: crypto.randomUUID(),
      sessionTokenHash,
      userId,
      createdAt: now,
      expiresAt,
      revokedAt: null,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    };

    const collection = await getUserSessionsCollection();
    await collection.insertOne(doc);

    return { token: rawToken, session: doc };
  },

  /**
   * Finds an active, unrevoked, unexpired session across root admins, super admins, or users.
   */
  async findValidSession(rawToken: string): Promise<ValidSessionResult | null> {
    if (!rawToken || typeof rawToken !== 'string') return null;

    const sessionTokenHash = hashSessionToken(rawToken);
    const now = new Date();

    // 1. Check Root Admin sessions
    const rootCol = await getRootAdminSessionsCollection();
    const rootSession = await rootCol.findOne({
      sessionTokenHash,
      revokedAt: null,
      expiresAt: { $gt: now },
    });
    if (rootSession) {
      return {
        ...rootSession,
        role: 'root_admin',
        accountId: rootSession.rootAdminId,
        rootAdminId: rootSession.rootAdminId,
        adminId: rootSession.rootAdminId,
      };
    }

    // 2. Check Super Admin sessions
    const superCol = await getSuperAdminSessionsCollection();
    const superSession = await superCol.findOne({
      sessionTokenHash,
      revokedAt: null,
      expiresAt: { $gt: now },
    });
    if (superSession) {
      return {
        ...superSession,
        role: 'superadmin',
        accountId: superSession.adminId,
        adminId: superSession.adminId,
      };
    }

    // 3. Check User sessions
    const userCol = await getUserSessionsCollection();
    const userSession = await userCol.findOne({
      sessionTokenHash,
      revokedAt: null,
      expiresAt: { $gt: now },
    });
    if (userSession) {
      return {
        ...userSession,
        role: 'user',
        accountId: userSession.userId,
        userId: userSession.userId,
      };
    }

    return null;
  },

  /**
   * Revokes a single session across all session collections.
   */
  async revokeSession(rawToken: string): Promise<void> {
    if (!rawToken || typeof rawToken !== 'string') return;

    const sessionTokenHash = hashSessionToken(rawToken);
    const now = new Date();

    const [rootCol, superCol, userCol] = await Promise.all([
      getRootAdminSessionsCollection(),
      getSuperAdminSessionsCollection(),
      getUserSessionsCollection(),
    ]);

    await Promise.all([
      rootCol.updateOne({ sessionTokenHash, revokedAt: null }, { $set: { revokedAt: now } }),
      superCol.updateOne({ sessionTokenHash, revokedAt: null }, { $set: { revokedAt: now } }),
      userCol.updateOne({ sessionTokenHash, revokedAt: null }, { $set: { revokedAt: now } }),
    ]);
  },

  /**
   * Revokes all active sessions for a Root Admin.
   */
  async revokeAllForRootAdmin(rootAdminId: string): Promise<void> {
    if (!rootAdminId) return;
    const col = await getRootAdminSessionsCollection();
    await col.updateMany({ rootAdminId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  },

  /**
   * Revokes all active sessions for a Super Admin.
   */
  async revokeAllForSuperAdmin(adminId: string): Promise<void> {
    if (!adminId) return;
    const col = await getSuperAdminSessionsCollection();
    await col.updateMany({ adminId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  },

  /**
   * Alias for backward compatibility
   */
  async revokeAllForAdmin(adminId: string): Promise<void> {
    return this.revokeAllForSuperAdmin(adminId);
  },

  /**
   * Revokes all active sessions for an ordinary User.
   */
  async revokeAllForUser(userId: string): Promise<void> {
    if (!userId) return;
    const col = await getUserSessionsCollection();
    await col.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  },
};
