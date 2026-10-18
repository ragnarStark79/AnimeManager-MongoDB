import { randomUUID } from 'node:crypto';
import {
  getBookmarksCollection,
  getTitlesCollection,
  type BookmarkDocument,
  type TitleDocument,
} from './mongo.js';
import type { BookmarkCreateInput, BookmarkUpdateInput } from '@animemanager/shared';
import { NotFoundError, ForbiddenError, ConflictError } from '../errors/index.js';

export interface BookmarkListItem {
  id: string;
  ownerId: string;
  titleId: string;
  status: string;
  progress: number;
  progressUnit: string;
  progressTotal: number | null;
  priority: number | null;
  personalRating: number | null;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  title: {
    id: string;
    englishTitle: string;
    originalTitle: string | null;
    mediaType: string;
    coverUrl: string | null;
    episodeCount: number | null;
    chapterCount: number | null;
  };
}

export interface BookmarkListFilters {
  status?: string;
  mediaType?: string;
  page: number;
  pageSize: number;
  sortBy: 'updatedAt' | 'createdAt' | 'personalRating' | 'priority' | 'progress';
  sortOrder: 'asc' | 'desc';
}

function mapDocToItem(doc: BookmarkDocument, titleDoc?: TitleDocument | null): BookmarkListItem {
  return {
    id: doc._id,
    ownerId: doc.ownerId,
    titleId: doc.titleId,
    status: doc.status,
    progress: doc.progress,
    progressUnit: doc.progressUnit || 'episode',
    progressTotal: doc.progressTotal ?? null,
    priority: doc.priority ?? null,
    personalRating: doc.personalRating !== null && doc.personalRating !== undefined ? Number(doc.personalRating) : null,
    notes: doc.notes || null,
    startedAt: doc.startedAt || null,
    completedAt: doc.completedAt || null,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : String(doc.updatedAt),
    title: {
      id: doc.titleId,
      englishTitle: titleDoc?.englishTitle || 'Unknown Title',
      originalTitle: titleDoc?.originalTitle || null,
      mediaType: titleDoc?.mediaType || 'anime',
      coverUrl: titleDoc?.coverUrl || null,
      episodeCount: titleDoc?.episodeCount ?? null,
      chapterCount: titleDoc?.chapterCount ?? null,
    },
  };
}

export const bookmarksRepository = {
  async list(ownerId: string, filters: BookmarkListFilters) {
    const { status, mediaType, page, pageSize, sortBy, sortOrder } = filters;
    const offset = (page - 1) * pageSize;

    const bookmarksCol = await getBookmarksCollection();
    const titlesCol = await getTitlesCollection();

    // If mediaType is provided, we must restrict bookmarks to titles with that mediaType
    let candidateTitleIds: string[] | null = null;
    if (mediaType) {
      const matchingTitles = await titlesCol
        .find({ ownerId, mediaType }, { projection: { _id: 1 } })
        .toArray();
      candidateTitleIds = matchingTitles.map((t) => t._id);
    }

    const query: Record<string, unknown> = { ownerId };
    if (status) {
      query.status = status;
    }
    if (candidateTitleIds !== null) {
      query.titleId = { $in: candidateTitleIds };
    }

    const sortDir = sortOrder.toLowerCase() === 'asc' ? 1 : -1;
    const sortFieldMap: Record<string, string> = {
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      personalRating: 'personalRating',
      priority: 'priority',
      progress: 'progress',
    };
    const sortProp = sortFieldMap[sortBy] || 'updatedAt';
    const sortObj: Record<string, 1 | -1> = { [sortProp]: sortDir };

    const total = await bookmarksCol.countDocuments(query);
    const docs = await bookmarksCol
      .find(query)
      .sort(sortObj)
      .skip(offset)
      .limit(pageSize)
      .toArray();

    const titleIds = docs.map((d) => d.titleId);
    const titleDocs = await titlesCol
      .find({ _id: { $in: titleIds }, ownerId })
      .toArray();
    const titleMap = new Map(titleDocs.map((t) => [t._id, t]));

    const items = docs.map((d) => mapDocToItem(d, titleMap.get(d.titleId)));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  },

  async findById(ownerId: string, id: string): Promise<BookmarkListItem | null> {
    const col = await getBookmarksCollection();
    const doc = await col.findOne({ _id: id, ownerId });
    if (!doc) return null;

    const titlesCol = await getTitlesCollection();
    const titleDoc = await titlesCol.findOne({ _id: doc.titleId, ownerId });

    return mapDocToItem(doc, titleDoc);
  },

  async findByTitleId(ownerId: string, titleId: string): Promise<BookmarkListItem | null> {
    const col = await getBookmarksCollection();
    const doc = await col.findOne({ titleId, ownerId });
    if (!doc) return null;

    const titlesCol = await getTitlesCollection();
    const titleDoc = await titlesCol.findOne({ _id: titleId, ownerId });

    return mapDocToItem(doc, titleDoc);
  },

  async create(ownerId: string, data: BookmarkCreateInput): Promise<BookmarkListItem> {
    // 1. Verify caller owns the referenced title
    const titlesCol = await getTitlesCollection();
    const titleDoc = await titlesCol.findOne({ _id: data.titleId, ownerId });
    if (!titleDoc) {
      throw new ForbiddenError('Referenced title does not belong to you or does not exist');
    }

    // 2. Check if a bookmark already exists for this title
    const col = await getBookmarksCollection();
    const existing = await col.findOne({ ownerId, titleId: data.titleId });
    if (existing) {
      throw new ConflictError(
        'A bookmark already exists for this title. Use PUT /titles/:id/bookmark or PATCH /bookmarks/:id to update.'
      );
    }

    const now = new Date();
    const newDoc: BookmarkDocument = {
      _id: randomUUID(),
      ownerId,
      titleId: data.titleId,
      status: data.status,
      progress: data.progress ?? 0,
      progressUnit: data.progressUnit || (titleDoc.mediaType === 'anime' ? 'episode' : 'chapter'),
      progressTotal: data.progressTotal ?? (titleDoc.mediaType === 'anime' ? titleDoc.episodeCount : titleDoc.chapterCount) ?? null,
      priority: data.priority ?? null,
      personalRating: data.personalRating !== null && data.personalRating !== undefined ? Number(data.personalRating) : null,
      notes: data.notes || null,
      startedAt: data.startedAt || null,
      completedAt: data.completedAt || null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await col.insertOne(newDoc);
    } catch (err: any) {
      if (err && err.code === 11000) {
        throw new ConflictError('A bookmark already exists for this title.');
      }
      throw err;
    }

    return mapDocToItem(newDoc, titleDoc);
  },

  async update(ownerId: string, id: string, data: BookmarkUpdateInput): Promise<BookmarkListItem | null> {
    const col = await getBookmarksCollection();
    const existing = await col.findOne({ _id: id, ownerId });
    if (!existing) {
      return null;
    }

    const updates: Partial<BookmarkDocument> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };

    if (data.status !== undefined) updates.status = data.status;
    if (data.progress !== undefined) updates.progress = data.progress;
    if (data.progressUnit !== undefined) updates.progressUnit = data.progressUnit;
    if (data.progressTotal !== undefined) updates.progressTotal = data.progressTotal;
    if (data.priority !== undefined) updates.priority = data.priority;
    if (data.personalRating !== undefined) {
      updates.personalRating = data.personalRating !== null ? Number(data.personalRating) : null;
    }
    if (data.notes !== undefined) updates.notes = data.notes;
    if (data.startedAt !== undefined) updates.startedAt = data.startedAt;
    if (data.completedAt !== undefined) updates.completedAt = data.completedAt;

    await col.updateOne({ _id: id, ownerId }, { $set: updates });

    const updatedDoc = await col.findOne({ _id: id, ownerId });
    if (!updatedDoc) return null;

    const titlesCol = await getTitlesCollection();
    const titleDoc = await titlesCol.findOne({ _id: updatedDoc.titleId, ownerId });

    return mapDocToItem(updatedDoc, titleDoc);
  },

  async delete(ownerId: string, id: string): Promise<boolean> {
    const col = await getBookmarksCollection();
    const res = await col.deleteOne({ _id: id, ownerId });
    return res.deletedCount > 0;
  },

  async upsertByTitleId(
    ownerId: string,
    titleId: string,
    data: Omit<BookmarkCreateInput, 'titleId'>
  ): Promise<BookmarkListItem> {
    // 1. Verify caller owns title
    const titlesCol = await getTitlesCollection();
    const titleDoc = await titlesCol.findOne({ _id: titleId, ownerId });
    if (!titleDoc) {
      throw new ForbiddenError('Referenced title does not belong to you or does not exist');
    }

    const col = await getBookmarksCollection();
    const now = new Date();

    const updateFields: Partial<BookmarkDocument> = {
      status: data.status,
      progress: data.progress ?? 0,
      progressUnit: data.progressUnit || (titleDoc.mediaType === 'anime' ? 'episode' : 'chapter'),
      progressTotal: data.progressTotal ?? (titleDoc.mediaType === 'anime' ? titleDoc.episodeCount : titleDoc.chapterCount) ?? null,
      priority: data.priority ?? null,
      personalRating: data.personalRating !== null && data.personalRating !== undefined ? Number(data.personalRating) : null,
      notes: data.notes || null,
      startedAt: data.startedAt || null,
      completedAt: data.completedAt || null,
      updatedAt: now,
    };

    const res = await col.findOneAndUpdate(
      { ownerId, titleId },
      {
        $set: updateFields,
        $setOnInsert: {
          _id: randomUUID(),
          ownerId,
          titleId,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    const doc = res || (await col.findOne({ ownerId, titleId }));
    if (!doc) {
      throw new Error('Failed to retrieve upserted bookmark');
    }

    return mapDocToItem(doc as BookmarkDocument, titleDoc);
  },
};
