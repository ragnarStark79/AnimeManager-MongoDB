import { randomUUID } from 'node:crypto';
import { getRootAdminsCollection, type RootAdminDocument } from './mongo.js';
import type { RootAdminStatus } from '@animemanager/shared';

export interface CreateRootAdminParams {
  email: string;
  username?: string;
  displayName: string;
  passwordHash: string;
  status?: RootAdminStatus;
}

export const rootAdminsRepository = {
  async findByEmail(email: string): Promise<RootAdminDocument | null> {
    const collection = await getRootAdminsCollection();
    const normalized = email.trim().toLowerCase();
    return collection.findOne({ email: normalized });
  },

  async findById(id: string): Promise<RootAdminDocument | null> {
    const collection = await getRootAdminsCollection();
    return collection.findOne({ _id: id });
  },

  async create(params: CreateRootAdminParams): Promise<RootAdminDocument> {
    const collection = await getRootAdminsCollection();
    const now = new Date();
    const doc: RootAdminDocument = {
      _id: randomUUID(),
      email: params.email.trim().toLowerCase(),
      username: params.username ? params.username.trim().toLowerCase() : undefined,
      displayName: params.displayName.trim(),
      passwordHash: params.passwordHash,
      role: 'root_admin',
      status: params.status || 'active',
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    };

    await collection.insertOne(doc);
    return doc;
  },

  async updateStatus(id: string, status: RootAdminStatus): Promise<boolean> {
    const collection = await getRootAdminsCollection();
    const result = await collection.updateOne(
      { _id: id },
      { $set: { status, updatedAt: new Date() } }
    );
    return result.matchedCount > 0;
  },

  async updateLastLogin(id: string): Promise<void> {
    const collection = await getRootAdminsCollection();
    await collection.updateOne(
      { _id: id },
      { $set: { lastLoginAt: new Date(), updatedAt: new Date() } }
    );
  },

  async countActive(): Promise<number> {
    const collection = await getRootAdminsCollection();
    return collection.countDocuments({ status: 'active' });
  },

  async listAll(): Promise<RootAdminDocument[]> {
    const collection = await getRootAdminsCollection();
    return collection.find({}).sort({ createdAt: -1 }).toArray();
  },
};
