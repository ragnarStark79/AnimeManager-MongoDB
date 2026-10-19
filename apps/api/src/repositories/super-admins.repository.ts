import crypto from 'node:crypto';
import { getSuperAdminsCollection, type SuperAdminDocument } from './mongo.js';

export interface CreateSuperAdminParams {
  id?: string;
  email: string;
  username?: string;
  passwordHash: string;
  displayName?: string;
  status?: 'active' | 'disabled';
}

export const superAdminsRepository = {
  async findByEmail(email: string): Promise<SuperAdminDocument | null> {
    if (!email || typeof email !== 'string') return null;
    const normalized = email.trim().toLowerCase();
    const collection = await getSuperAdminsCollection();
    return collection.findOne({ email: normalized });
  },

  async findByUsername(username: string): Promise<SuperAdminDocument | null> {
    if (!username || typeof username !== 'string') return null;
    const normalized = username.trim().toLowerCase();
    const collection = await getSuperAdminsCollection();
    return collection.findOne({ username: normalized });
  },

  async findById(id: string): Promise<SuperAdminDocument | null> {
    if (!id || typeof id !== 'string') return null;
    const collection = await getSuperAdminsCollection();
    return collection.findOne({ _id: id });
  },

  async create(params: CreateSuperAdminParams): Promise<SuperAdminDocument> {
    const collection = await getSuperAdminsCollection();
    const now = new Date();
    const normalizedEmail = params.email.trim().toLowerCase();

    const doc: SuperAdminDocument = {
      _id: params.id || crypto.randomUUID(),
      email: normalizedEmail,
      username: params.username ? params.username.trim().toLowerCase() : undefined,
      passwordHash: params.passwordHash,
      displayName: (params.displayName || normalizedEmail.split('@')[0] || 'Super Admin').trim(),
      role: 'superadmin',
      status: params.status || 'active',
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    };

    await collection.insertOne(doc);
    return doc;
  },

  async updateLastLogin(id: string): Promise<void> {
    const collection = await getSuperAdminsCollection();
    const now = new Date();
    await collection.updateOne(
      { _id: id },
      { $set: { lastLoginAt: now, updatedAt: now } }
    );
  },

  async count(): Promise<number> {
    const collection = await getSuperAdminsCollection();
    return collection.countDocuments();
  },

  async countActive(): Promise<number> {
    const collection = await getSuperAdminsCollection();
    return collection.countDocuments({ status: 'active' });
  },

  async listAll(): Promise<Omit<SuperAdminDocument, 'passwordHash'>[]> {
    const collection = await getSuperAdminsCollection();
    return collection
      .find({}, { projection: { passwordHash: 0 } })
      .sort({ createdAt: -1 })
      .toArray() as Promise<Omit<SuperAdminDocument, 'passwordHash'>[]>;
  },

  async updateStatus(
    id: string,
    status: 'active' | 'disabled'
  ): Promise<Omit<SuperAdminDocument, 'passwordHash'> | null> {
    if (!id || typeof id !== 'string') return null;
    const collection = await getSuperAdminsCollection();
    const now = new Date();

    const result = await collection.findOneAndUpdate(
      { _id: id },
      { $set: { status, updatedAt: now } },
      { projection: { passwordHash: 0 }, returnDocument: 'after' }
    );

    return result || null;
  },

  async delete(id: string): Promise<boolean> {
    if (!id || typeof id !== 'string') return false;
    const collection = await getSuperAdminsCollection();
    const result = await collection.deleteOne({ _id: id });
    return result.deletedCount > 0;
  },
};


