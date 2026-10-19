import { randomUUID } from 'node:crypto';
import { getAuditLogsCollection, type AuditLogDocument } from './mongo.js';

export interface CreateAuditLogParams {
  eventType: string;
  actorId: string;
  actorRole: 'root_admin' | 'superadmin' | 'user' | 'system';
  targetId?: string | null;
  targetType?: 'user' | 'superadmin' | 'root_admin' | 'library' | 'system';
  action: string;
  outcome?: 'success' | 'failure';
  metadata?: Record<string, unknown>;
  timestamp?: Date;
}

export interface AuditLogListFilters {
  targetType?: string;
  actorRole?: string;
  eventType?: string;
  limit?: number;
  offset?: number;
}

export const auditLogsRepository = {
  /**
   * Appends an audit log event.
   * Ensures non-sensitive metadata only (never logs passwords, hashes, or private library details).
   */
  async recordEvent(params: CreateAuditLogParams): Promise<AuditLogDocument | null> {
    try {
      const collection = await getAuditLogsCollection();
      const doc: AuditLogDocument = {
        _id: randomUUID(),
        eventType: params.eventType,
        actorId: params.actorId,
        actorRole: params.actorRole,
        targetId: params.targetId || null,
        targetType: params.targetType || undefined,
        action: params.action,
        outcome: params.outcome || 'success',
        metadata: params.metadata || {},
        timestamp: params.timestamp || new Date(),
      };

      await collection.insertOne(doc);
      return doc;
    } catch (err) {
      console.error('[AuditLog] Failed to record audit log event:', err);
      return null;
    }
  },

  /**
   * Lists audit events with filtering and pagination.
   */
  async listEvents(filters: AuditLogListFilters = {}): Promise<{ items: AuditLogDocument[]; total: number; earliestHistory: Date | null }> {
    const collection = await getAuditLogsCollection();
    const query: Record<string, unknown> = {};

    if (filters.targetType) {
      query.targetType = filters.targetType;
    }
    if (filters.actorRole) {
      query.actorRole = filters.actorRole;
    }
    if (filters.eventType) {
      query.eventType = filters.eventType;
    }

    const limit = Math.min(filters.limit || 50, 100);
    const offset = filters.offset || 0;

    const [items, total, earliestDoc] = await Promise.all([
      collection.find(query).sort({ timestamp: -1 }).skip(offset).limit(limit).toArray(),
      collection.countDocuments(query),
      collection.find({}).sort({ timestamp: 1 }).limit(1).toArray(),
    ]);

    const earliestHistory = earliestDoc.length > 0 ? earliestDoc[0].timestamp : null;

    return { items, total, earliestHistory };
  },

  /**
   * Lists privacy-preserving user activity (only ordinary user events, strictly excluding private title content).
   */
  async listUserActivity(limit = 50, offset = 0): Promise<{ items: AuditLogDocument[]; total: number }> {
    const collection = await getAuditLogsCollection();
    const query: Record<string, unknown> = {
      $or: [
        { actorRole: 'user' },
        { targetType: 'user' },
      ],
    };

    const [items, total] = await Promise.all([
      collection.find(query).sort({ timestamp: -1 }).skip(offset).limit(limit).toArray(),
      collection.countDocuments(query),
    ]);

    return { items, total };
  },

  /**
   * Returns count of total audit events recorded.
   */
  async countTotal(): Promise<number> {
    const collection = await getAuditLogsCollection();
    return collection.countDocuments({});
  },
};
