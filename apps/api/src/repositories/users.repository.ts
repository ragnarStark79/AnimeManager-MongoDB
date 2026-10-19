import { randomUUID } from 'node:crypto';
import { getUsersCollection, type UserDocument } from './mongo.js';
import type { UserStatus } from '@animemanager/shared';

export interface CreateUserParams {
  username: string;
  email: string;
  displayName: string;
  passwordHash: string;
  status?: UserStatus;
}

export const usersRepository = {
  async findByEmail(email: string): Promise<UserDocument | null> {
    const collection = await getUsersCollection();
    const normalized = email.trim().toLowerCase();
    return collection.findOne({ email: normalized });
  },

  async findByUsername(username: string): Promise<UserDocument | null> {
    const collection = await getUsersCollection();
    const normalized = username.trim().toLowerCase();
    return collection.findOne({ username: normalized });
  },

  async findById(id: string): Promise<UserDocument | null> {
    const collection = await getUsersCollection();
    return collection.findOne({ _id: id });
  },

  async create(params: CreateUserParams): Promise<UserDocument> {
    const collection = await getUsersCollection();
    const now = new Date();
    const userDoc: UserDocument = {
      _id: randomUUID(),
      username: params.username.trim().toLowerCase(),
      email: params.email.trim().toLowerCase(),
      displayName: params.displayName.trim(),
      passwordHash: params.passwordHash,
      role: 'user',
      status: params.status || 'active',
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    };

    await collection.insertOne(userDoc);
    return userDoc;
  },

  async updateStatus(id: string, status: UserStatus): Promise<boolean> {
    const collection = await getUsersCollection();
    const result = await collection.updateOne(
      { _id: id },
      { $set: { status, updatedAt: new Date() } }
    );
    return result.matchedCount > 0;
  },

  async updateLastLogin(id: string): Promise<void> {
    const collection = await getUsersCollection();
    await collection.updateOne(
      { _id: id },
      { $set: { lastLoginAt: new Date(), updatedAt: new Date() } }
    );
  },

  async delete(id: string, hard = false): Promise<boolean> {
    const collection = await getUsersCollection();
    if (hard) {
      const result = await collection.deleteOne({ _id: id });
      return result.deletedCount > 0;
    }
    const result = await collection.updateOne(
      { _id: id },
      { $set: { status: 'deleted', updatedAt: new Date() } }
    );
    return result.matchedCount > 0;
  },

  async listAll(): Promise<UserDocument[]> {
    const collection = await getUsersCollection();
    return collection.find({}).sort({ createdAt: -1 }).toArray();
  },

  async countTotal(): Promise<number> {
    const collection = await getUsersCollection();
    return collection.countDocuments({});
  },

  async countByStatus(status: UserStatus): Promise<number> {
    const collection = await getUsersCollection();
    return collection.countDocuments({ status });
  },
};
