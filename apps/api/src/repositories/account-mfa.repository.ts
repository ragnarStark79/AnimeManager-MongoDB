import crypto from 'node:crypto';
import { getAccountMfaCollection, type AccountMfaDocument } from './mongo.js';
import type { AuthRole } from '@animemanager/shared';

export interface StartPendingSetupParams {
  accountId: string;
  accountRole: 'user' | 'superadmin' | 'root_admin';
  pendingEncryptedTotpSecret: string;
  expiresAt: Date;
}

export interface ConfirmSetupParams {
  accountId: string;
  accountRole: 'user' | 'superadmin' | 'root_admin';
  encryptedTotpSecret: string;
  recoveryCodeHashes: string[];
  timeStep: number;
}

export const accountMfaRepository = {
  /**
   * Retrieves the MFA document for a specific account identity and role.
   */
  async findByAccount(
    accountId: string,
    accountRole: 'user' | 'superadmin' | 'root_admin'
  ): Promise<AccountMfaDocument | null> {
    if (!accountId || !accountRole) return null;
    const collection = await getAccountMfaCollection();
    return collection.findOne({ accountId, accountRole });
  },

  /**
   * Starts a pending TOTP setup.
   * Upserts the MFA document, storing the pending encrypted secret and an expiration timestamp.
   * Does NOT enable MFA until verification succeeds.
   */
  async startPendingSetup(params: StartPendingSetupParams): Promise<AccountMfaDocument> {
    const collection = await getAccountMfaCollection();
    const now = new Date();

    const existing = await collection.findOne({
      accountId: params.accountId,
      accountRole: params.accountRole,
    });

    if (existing) {
      await collection.updateOne(
        { _id: existing._id },
        {
          $set: {
            pendingEncryptedTotpSecret: params.pendingEncryptedTotpSecret,
            pendingSetupExpiresAt: params.expiresAt,
            updatedAt: now,
          },
        }
      );
      return {
        ...existing,
        pendingEncryptedTotpSecret: params.pendingEncryptedTotpSecret,
        pendingSetupExpiresAt: params.expiresAt,
        updatedAt: now,
      };
    }

    const doc: AccountMfaDocument = {
      _id: crypto.randomUUID(),
      accountId: params.accountId,
      accountRole: params.accountRole,
      totpEnabled: false,
      encryptedTotpSecret: null,
      pendingEncryptedTotpSecret: params.pendingEncryptedTotpSecret,
      pendingSetupExpiresAt: params.expiresAt,
      lastUsedTimeStep: null,
      recoveryCodeHashes: [],
      enrolledAt: null,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await collection.insertOne(doc);
    return doc;
  },

  /**
   * Confirms TOTP setup by promoting the pending secret to active,
   * activating totpEnabled, saving recovery codes, and clearing pending fields.
   */
  async confirmSetup(params: ConfirmSetupParams): Promise<boolean> {
    const collection = await getAccountMfaCollection();
    const now = new Date();

    const result = await collection.updateOne(
      {
        accountId: params.accountId,
        accountRole: params.accountRole,
      },
      {
        $set: {
          totpEnabled: true,
          encryptedTotpSecret: params.encryptedTotpSecret,
          pendingEncryptedTotpSecret: null,
          pendingSetupExpiresAt: null,
          recoveryCodeHashes: params.recoveryCodeHashes,
          lastUsedTimeStep: null,
          enrolledAt: now,
          lastUsedAt: now,
          updatedAt: now,
        },
      }
    );

    return result.matchedCount > 0;
  },

  /**
   * Updates the last used RFC 6238 time step to prevent code replay attacks.
   */
  async updateLastUsedTimeStep(
    accountId: string,
    accountRole: 'user' | 'superadmin' | 'root_admin',
    timeStep: number
  ): Promise<boolean> {
    const collection = await getAccountMfaCollection();
    const now = new Date();

    const result = await collection.updateOne(
      { accountId, accountRole },
      {
        $set: {
          lastUsedTimeStep: timeStep,
          lastUsedAt: now,
          updatedAt: now,
        },
      }
    );

    return result.matchedCount > 0;
  },

  /**
   * Atomically consumes a single-use recovery code.
   * Uses $pull to atomically remove the matching SHA-256 hash from recoveryCodeHashes.
   * Prevents race conditions or concurrent code replay.
   */
  async consumeRecoveryCode(
    accountId: string,
    accountRole: 'user' | 'superadmin' | 'root_admin',
    hashedCode: string
  ): Promise<boolean> {
    const collection = await getAccountMfaCollection();
    const now = new Date();

    const result = await collection.updateOne(
      {
        accountId,
        accountRole,
        recoveryCodeHashes: hashedCode,
      },
      {
        $pull: { recoveryCodeHashes: hashedCode },
        $set: {
          lastUsedAt: now,
          updatedAt: now,
        },
      }
    );

    return result.modifiedCount > 0;
  },

  /**
   * Securely disables two-step verification for an account.
   * Clears active secret, pending setup, and recovery codes.
   */
  async disable(
    accountId: string,
    accountRole: 'user' | 'superadmin' | 'root_admin'
  ): Promise<boolean> {
    const collection = await getAccountMfaCollection();
    const now = new Date();

    const result = await collection.updateOne(
      { accountId, accountRole },
      {
        $set: {
          totpEnabled: false,
          encryptedTotpSecret: null,
          pendingEncryptedTotpSecret: null,
          pendingSetupExpiresAt: null,
          recoveryCodeHashes: [],
          updatedAt: now,
        },
      }
    );

    return result.matchedCount > 0;
  },

  /**
   * Regenerates recovery code hashes for an account.
   */
  async regenerateRecoveryCodes(
    accountId: string,
    accountRole: 'user' | 'superadmin' | 'root_admin',
    newHashedCodes: string[]
  ): Promise<boolean> {
    const collection = await getAccountMfaCollection();
    const now = new Date();

    const result = await collection.updateOne(
      { accountId, accountRole, totpEnabled: true },
      {
        $set: {
          recoveryCodeHashes: newHashedCodes,
          updatedAt: now,
        },
      }
    );

    return result.matchedCount > 0;
  },
};
