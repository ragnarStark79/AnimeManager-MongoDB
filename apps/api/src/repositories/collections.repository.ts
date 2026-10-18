import { randomUUID } from 'node:crypto';
import {
  getCollectionsCollection,
  getTitlesCollection,
  type CollectionDocument,
  type CollectionItemDoc,
} from './mongo.js';
import type { CollectionCreateInput, CollectionUpdateInput } from '@animemanager/shared';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../errors/index.js';

export interface CollectionSummary {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  icon: string | null;
  color: string | null;
  sortMode: string;
  titleCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionDetail extends CollectionSummary {
  titles: Array<{
    id: string;
    englishTitle: string;
    originalTitle: string | null;
    mediaType: string;
    coverUrl: string | null;
    position: number | null;
    addedAt: string;
  }>;
}

function mapDocToSummary(doc: CollectionDocument): CollectionSummary {
  const actualCount = doc.items ? doc.items.length : (doc.titleCount || 0);
  return {
    id: doc._id,
    ownerId: doc.ownerId,
    name: doc.name,
    description: doc.description || null,
    coverUrl: doc.coverUrl || null,
    icon: doc.icon || null,
    color: doc.color || null,
    sortMode: doc.sortMode || 'date_added',
    titleCount: actualCount,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : String(doc.updatedAt),
  };
}

export const collectionsRepository = {
  async list(ownerId: string): Promise<CollectionSummary[]> {
    const col = await getCollectionsCollection();
    const docs = await col
      .find({ ownerId })
      .sort({ createdAt: 1 })
      .toArray();

    return docs.map(mapDocToSummary);
  },

  async findById(ownerId: string, collectionId: string): Promise<CollectionDetail | null> {
    const col = await getCollectionsCollection();
    const doc = await col.findOne({ _id: collectionId, ownerId });
    if (!doc) {
      return null;
    }

    const summary = mapDocToSummary(doc);
    const memberItems = doc.items || [];

    if (memberItems.length === 0) {
      return {
        ...summary,
        titles: [],
      };
    }

    const titleIds = memberItems.map((item) => item.titleId);
    const titlesCol = await getTitlesCollection();
    const titleDocs = await titlesCol
      .find({ _id: { $in: titleIds }, ownerId })
      .toArray();

    const titleMap = new Map(titleDocs.map((t) => [t._id, t]));

    // Preserve ordering according to item position (ascending), then addedAt
    const sortedMembers = [...memberItems].sort((a, b) => {
      const posA = a.position ?? 999999;
      const posB = b.position ?? 999999;
      if (posA !== posB) return posA - posB;
      const dateA = new Date(a.addedAt).getTime();
      const dateB = new Date(b.addedAt).getTime();
      return dateA - dateB;
    });

    const populatedTitles: CollectionDetail['titles'] = [];
    for (const member of sortedMembers) {
      const titleDoc = titleMap.get(member.titleId);
      if (titleDoc) {
        populatedTitles.push({
          id: titleDoc._id,
          englishTitle: titleDoc.englishTitle,
          originalTitle: titleDoc.originalTitle || null,
          mediaType: titleDoc.mediaType,
          coverUrl: titleDoc.coverUrl || null,
          position: member.position ?? null,
          addedAt: member.addedAt instanceof Date ? member.addedAt.toISOString() : String(member.addedAt),
        });
      }
    }

    return {
      ...summary,
      titles: populatedTitles,
    };
  },

  async create(ownerId: string, data: CollectionCreateInput): Promise<CollectionSummary> {
    const trimmedName = data.name.trim();
    if (!trimmedName) {
      throw new ValidationError('Collection name is required');
    }
    const normalizedName = trimmedName.toLowerCase();

    const col = await getCollectionsCollection();

    // Check duplicate collection name for this owner
    const existing = await col.findOne({ ownerId, normalizedName });
    if (existing) {
      throw new ConflictError('A collection with this name already exists in your library', 'DUPLICATE_RESOURCE');
    }

    const now = new Date();
    const newDoc: CollectionDocument = {
      _id: randomUUID(),
      ownerId,
      name: trimmedName,
      normalizedName,
      description: data.description ? data.description.trim() : null,
      coverUrl: data.coverUrl ? data.coverUrl.trim() : null,
      icon: data.icon ? data.icon.trim() : null,
      color: data.color ? data.color.trim() : null,
      sortMode: data.sortMode || 'date_added',
      items: [],
      titleCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await col.insertOne(newDoc);
    } catch (err: any) {
      if (err && err.code === 11000) {
        throw new ConflictError('A collection with this name already exists in your library', 'DUPLICATE_RESOURCE');
      }
      throw err;
    }

    return mapDocToSummary(newDoc);
  },

  async update(ownerId: string, collectionId: string, data: CollectionUpdateInput): Promise<CollectionSummary | null> {
    const col = await getCollectionsCollection();
    const existing = await col.findOne({ _id: collectionId, ownerId });
    if (!existing) {
      return null;
    }

    const updates: Partial<CollectionDocument> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) {
      const trimmedName = data.name.trim();
      if (!trimmedName) {
        throw new ValidationError('Collection name cannot be empty');
      }
      const normalizedName = trimmedName.toLowerCase();
      // Check for collision with another collection
      const collision = await col.findOne({
        ownerId,
        normalizedName,
        _id: { $ne: collectionId },
      });
      if (collision) {
        throw new ConflictError('A collection with this name already exists in your library', 'DUPLICATE_RESOURCE');
      }
      updates.name = trimmedName;
      updates.normalizedName = normalizedName;
    }

    if (data.description !== undefined) {
      updates.description = data.description ? data.description.trim() : null;
    }
    if (data.coverUrl !== undefined) {
      updates.coverUrl = data.coverUrl ? data.coverUrl.trim() : null;
    }
    if (data.icon !== undefined) {
      updates.icon = data.icon ? data.icon.trim() : null;
    }
    if (data.color !== undefined) {
      updates.color = data.color ? data.color.trim() : null;
    }
    if (data.sortMode !== undefined) {
      updates.sortMode = data.sortMode;
    }

    try {
      await col.updateOne({ _id: collectionId, ownerId }, { $set: updates });
    } catch (err: any) {
      if (err && err.code === 11000) {
        throw new ConflictError('A collection with this name already exists');
      }
      throw err;
    }

    const updatedDoc = await col.findOne({ _id: collectionId, ownerId });
    return updatedDoc ? mapDocToSummary(updatedDoc) : null;
  },

  async delete(ownerId: string, collectionId: string): Promise<boolean> {
    const col = await getCollectionsCollection();
    const res = await col.deleteOne({ _id: collectionId, ownerId });
    return res.deletedCount > 0;
  },

  async addTitles(ownerId: string, collectionId: string, titleIds: string[]): Promise<void> {
    // 1. Verify caller owns collection
    const col = await getCollectionsCollection();
    const collectionDoc = await col.findOne({ _id: collectionId, ownerId });
    if (!collectionDoc) {
      throw new NotFoundError('Collection not found');
    }

    // 2. Verify caller owns every title being added (strict cross-owner guard!)
    const titlesCol = await getTitlesCollection();
    const count = await titlesCol.countDocuments({
      _id: { $in: titleIds },
      ownerId,
    });
    if (count !== titleIds.length) {
      throw new ForbiddenError('One or more titles do not belong to you or do not exist');
    }

    // 3. Atomically add titles that are not already present, ensuring titleCount increases only on insertion
    const existingItems = collectionDoc.items || [];
    let currentMaxPos = existingItems.reduce((max, item) => Math.max(max, item.position || 0), 0);

    for (const titleId of titleIds) {
      currentMaxPos++;
      const nextItem: CollectionItemDoc = {
        titleId,
        position: currentMaxPos,
        addedAt: new Date(),
      };

      // Atomic push with condition that items.titleId does not already contain titleId
      await col.updateOne(
        { _id: collectionId, ownerId, 'items.titleId': { $ne: titleId } },
        {
          $push: { items: nextItem },
          $inc: { titleCount: 1 },
          $set: { updatedAt: new Date() },
        }
      );
    }
  },

  async removeTitle(ownerId: string, collectionId: string, titleId: string): Promise<boolean> {
    const col = await getCollectionsCollection();
    const collectionDoc = await col.findOne({ _id: collectionId, ownerId });
    if (!collectionDoc) {
      throw new NotFoundError('Collection not found');
    }

    // Atomically remove title and decrement titleCount ONLY if membership actually existed
    const updateRes = await col.updateOne(
      { _id: collectionId, ownerId, 'items.titleId': titleId },
      {
        $pull: { items: { titleId } },
        $inc: { titleCount: -1 },
        $set: { updatedAt: new Date() },
      }
    );

    return updateRes.modifiedCount > 0;
  },

  async reorderTitles(
    ownerId: string,
    collectionId: string,
    order: Array<{ titleId: string; position: number }>
  ): Promise<void> {
    const col = await getCollectionsCollection();
    const collectionDoc = await col.findOne({ _id: collectionId, ownerId });
    if (!collectionDoc) {
      throw new NotFoundError('Collection not found');
    }

    const orderMap = new Map(order.map((o) => [o.titleId, o.position]));
    const updatedItems = (collectionDoc.items || []).map((item) => {
      if (orderMap.has(item.titleId)) {
        return {
          ...item,
          position: orderMap.get(item.titleId)!,
        };
      }
      return item;
    });

    updatedItems.sort((a, b) => (a.position || 0) - (b.position || 0));

    await col.updateOne(
      { _id: collectionId, ownerId },
      {
        $set: {
          items: updatedItems,
          updatedAt: new Date(),
        },
      }
    );
  },
};
