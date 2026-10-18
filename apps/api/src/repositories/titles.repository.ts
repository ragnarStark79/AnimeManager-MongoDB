import { randomUUID } from 'node:crypto';
import type { Document } from 'mongodb';
import {
  getTitlesCollection,
  getCollectionsCollection,
  getBookmarksCollection,
  withOptionalTransaction,
  type TitleDocument,
  type TitleAliasDoc,
  type TitleGenreDoc,
  type TitleTagDoc,
} from './mongo.js';
import type { TitleCreateInput, TitleUpdateInput } from '@animemanager/shared';

export interface TitleListFilters {
  page: number;
  pageSize: number;
  search?: string;
  mediaType?: string;
  collectionId?: string;
  bookmarkStatus?: string;
  sortBy: 'title' | 'createdAt' | 'updatedAt' | 'releaseYear' | 'personalRating';
  sortOrder: 'asc' | 'desc';
}

export interface TitleHydrated {
  id: string;
  ownerId: string;
  mediaType: string;
  englishTitle: string;
  originalTitle: string | null;
  synopsis: string | null;
  background: string | null;
  coverUrl: string | null;
  coverStoragePath: string | null;
  coverSourceType: string;
  releaseYear: number | null;
  publicationStatus: string | null;
  startDate: string | null;
  endDate: string | null;
  episodeCount: number | null;
  chapterCount: number | null;
  sourceScore: number | null;
  sourceRank: number | null;
  sourcePopularity: number | null;
  createdAt: string;
  updatedAt: string;
  aliases: Array<{ id: string; alias: string; languageCode: string | null; aliasType: string | null }>;
  genres: Array<{ id: string; name: string; slug: string }>;
  tags: Array<{ id: string; name: string; slug: string }>;
  collections: Array<{ id: string; name: string; icon: string | null; color: string | null }>;
  bookmark: {
    id: string;
    status: string;
    progress: number;
    progressUnit: string;
    progressTotal: number | null;
    priority: number | null;
    personalRating: number | null;
    notes: string | null;
    startedAt: string | null;
    completedAt: string | null;
  } | null;
  externalSources: Array<{ id: string; provider: string; externalId: string; sourceUrl: string | null }>;
}

export const titlesRepository = {
  async list(ownerId: string, filters: Partial<TitleListFilters> & { q?: string }) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : 20;
    const search = filters.search || filters.q;
    const { mediaType, collectionId, bookmarkStatus } = filters;
    const sortBy = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder || 'desc';
    const offset = (page - 1) * pageSize;

    const matchQuery: Record<string, unknown> = {
      ownerId,
    };

    if (mediaType) {
      matchQuery.mediaType = mediaType;
    }

    if (collectionId) {
      const collectionsCol = await getCollectionsCollection();
      const col = await collectionsCol.findOne({ _id: collectionId, ownerId });
      if (!col || !col.items || col.items.length === 0) {
        return {
          items: [],
          total: 0,
          page,
          pageSize,
          totalPages: 1,
        };
      }
      const titleIdsInCol = col.items.map((i) => i.titleId);
      matchQuery._id = { $in: titleIdsInCol };
    }

    if (search && search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      matchQuery.$or = [
        { englishTitle: regex },
        { originalTitle: regex },
        { 'aliases.alias': regex },
      ];
    }

    const titlesCol = await getTitlesCollection();

    // Build aggregation pipeline to join bookmark and support all sort modes
    const pipeline: Document[] = [
      { $match: matchQuery },
      {
        $lookup: {
          from: 'bookmarks',
          let: { titleId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$titleId', '$$titleId'] },
                    { $eq: ['$ownerId', ownerId] },
                  ],
                },
              },
            },
          ],
          as: 'bookmarkDocs',
        },
      },
      {
        $addFields: {
          bookmark: { $arrayElemAt: ['$bookmarkDocs', 0] },
        },
      },
    ];

    if (bookmarkStatus) {
      pipeline.push({
        $match: {
          'bookmark.status': bookmarkStatus,
        },
      });
    }

    // Sorting
    const dir = sortOrder === 'asc' ? 1 : -1;
    if (sortBy === 'title') {
      pipeline.push({ $sort: { englishTitle: dir } });
    } else if (sortBy === 'createdAt') {
      pipeline.push({ $sort: { createdAt: dir } });
    } else if (sortBy === 'updatedAt') {
      pipeline.push({ $sort: { updatedAt: dir } });
    } else if (sortBy === 'releaseYear') {
      // Nulls last in MongoDB: create auxiliary sorting field
      pipeline.push({
        $addFields: {
          sortYear: { $ifNull: ['$releaseYear', dir === 1 ? 99999 : -99999] },
        },
      });
      pipeline.push({ $sort: { sortYear: dir } });
    } else if (sortBy === 'personalRating') {
      pipeline.push({
        $addFields: {
          sortRating: { $ifNull: ['$bookmark.personalRating', dir === 1 ? 999 : -1] },
        },
      });
      pipeline.push({ $sort: { sortRating: dir } });
    }

    pipeline.push({
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [{ $skip: offset }, { $limit: pageSize }],
      },
    });

    const result = await titlesCol.aggregate<{
      metadata: Array<{ total: number }>;
      data: Array<TitleDocument & { bookmark?: Record<string, unknown> }>;
    }>(pipeline).toArray();

    const total = result[0]?.metadata[0]?.total || 0;
    const rawData = result[0]?.data || [];

    return {
      items: rawData.map((t) => {
        const b = t.bookmark;
        return {
          id: t._id,
          ownerId: t.ownerId,
          mediaType: t.mediaType,
          englishTitle: t.englishTitle,
          originalTitle: t.originalTitle,
          synopsis: t.synopsis,
          coverUrl: t.coverUrl,
          coverStoragePath: t.coverStoragePath,
          coverSourceType: t.coverSourceType,
          releaseYear: t.releaseYear,
          publicationStatus: t.publicationStatus,
          episodeCount: t.episodeCount,
          chapterCount: t.chapterCount,
          sourceScore: t.sourceScore,
          sourceRank: t.sourceRank,
          createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
          updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt),
          bookmark: b
            ? {
                id: (b._id as string) || (b.id as string),
                status: b.status as string,
                progress: Number(b.progress) || 0,
                progressUnit: (b.progressUnit as string) || 'unit',
                progressTotal: b.progressTotal != null ? Number(b.progressTotal) : null,
                personalRating: b.personalRating != null ? Number(b.personalRating) : null,
              }
            : null,
        };
      }),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  },

  async findById(ownerId: string, titleId: string): Promise<TitleHydrated | null> {
    const titlesCol = await getTitlesCollection();
    const t = await titlesCol.findOne({ _id: titleId, ownerId });
    if (!t) {
      return null;
    }

    const bookmarksCol = await getBookmarksCollection();
    const b = await bookmarksCol.findOne({ ownerId, titleId });

    const collectionsCol = await getCollectionsCollection();
    const collections = await collectionsCol
      .find({ ownerId, 'items.titleId': titleId })
      .toArray();

    return {
      id: t._id,
      ownerId: t.ownerId,
      mediaType: t.mediaType,
      englishTitle: t.englishTitle,
      originalTitle: t.originalTitle,
      synopsis: t.synopsis,
      background: t.background,
      coverUrl: t.coverUrl,
      coverStoragePath: t.coverStoragePath,
      coverSourceType: t.coverSourceType,
      releaseYear: t.releaseYear,
      publicationStatus: t.publicationStatus,
      startDate: t.startDate,
      endDate: t.endDate,
      episodeCount: t.episodeCount,
      chapterCount: t.chapterCount,
      sourceScore: t.sourceScore != null ? Number(t.sourceScore) : null,
      sourceRank: t.sourceRank,
      sourcePopularity: t.sourcePopularity,
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
      updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt),
      aliases: (t.aliases || []).map((a) => ({
        id: a.id || randomUUID(),
        alias: a.alias,
        languageCode: a.languageCode || null,
        aliasType: a.aliasType || null,
      })),
      genres: (t.genres || []).map((g) => ({
        id: g.id || randomUUID(),
        name: g.name,
        slug: g.slug,
      })),
      tags: (t.tags || []).map((tag) => ({
        id: tag.id || randomUUID(),
        name: tag.name,
        slug: tag.slug,
      })),
      collections: collections.map((c) => ({
        id: c._id,
        name: c.name,
        icon: c.icon,
        color: c.color,
      })),
      bookmark: b
        ? {
            id: b._id,
            status: b.status,
            progress: b.progress,
            progressUnit: b.progressUnit,
            progressTotal: b.progressTotal,
            priority: b.priority,
            personalRating: b.personalRating != null ? Number(b.personalRating) : null,
            notes: b.notes,
            startedAt: b.startedAt,
            completedAt: b.completedAt,
          }
        : null,
      externalSources: (t.externalSources || []).map((es) => ({
        id: es.id || randomUUID(),
        provider: es.provider,
        externalId: es.externalId,
        sourceUrl: es.sourceUrl || null,
      })),
    };
  },

  async create(ownerId: string, data: TitleCreateInput): Promise<TitleHydrated> {
    const titlesCol = await getTitlesCollection();
    const titleId = randomUUID();
    const now = new Date();

    const aliases: TitleAliasDoc[] = [];
    if (data.aliases && data.aliases.length > 0) {
      const seenAliases = new Set<string>();
      for (const a of data.aliases) {
        const trimmed = a.title?.trim();
        if (!trimmed || seenAliases.has(trimmed.toLowerCase())) continue;
        seenAliases.add(trimmed.toLowerCase());
        aliases.push({
          id: randomUUID(),
          alias: trimmed,
          languageCode: a.languageCode || null,
          aliasType: a.aliasType || null,
        });
      }
    }

    const genres: TitleGenreDoc[] = [];
    if (data.genres && data.genres.length > 0) {
      const seenGenres = new Set<string>();
      for (const g of data.genres) {
        const trimmed = g.trim();
        if (!trimmed || seenGenres.has(trimmed.toLowerCase())) continue;
        seenGenres.add(trimmed.toLowerCase());
        genres.push({
          id: randomUUID(),
          name: trimmed,
          slug: trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        });
      }
    }

    const tags: TitleTagDoc[] = [];
    if (data.tags && data.tags.length > 0) {
      const seenTags = new Set<string>();
      for (const tag of data.tags) {
        const trimmed = tag.trim();
        if (!trimmed || seenTags.has(trimmed.toLowerCase())) continue;
        seenTags.add(trimmed.toLowerCase());
        tags.push({
          id: randomUUID(),
          name: trimmed,
          slug: trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        });
      }
    }

    const doc: TitleDocument = {
      _id: titleId,
      ownerId,
      mediaType: data.mediaType,
      englishTitle: data.englishTitle.trim(),
      originalTitle: data.originalTitle?.trim() || null,
      synopsis: data.synopsis?.trim() || null,
      background: data.background?.trim() || null,
      coverUrl: data.coverUrl || null,
      coverStoragePath: data.coverStoragePath || null,
      coverSourceType: data.coverSourceType || 'none',
      releaseYear: data.releaseYear ?? null,
      publicationStatus: data.publicationStatus || null,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      episodeCount: data.episodeCount ?? null,
      chapterCount: data.chapterCount ?? null,
      sourceScore: data.sourceScore ?? null,
      sourceRank: data.sourceRank ?? null,
      sourcePopularity: data.sourcePopularity ?? null,
      aliases,
      genres,
      tags,
      externalSources: [],
      createdAt: now,
      updatedAt: now,
    };

    await titlesCol.insertOne(doc);

    const created = await titlesRepository.findById(ownerId, titleId);
    if (!created) {
      throw new Error('Failed to retrieve newly created title');
    }
    return created;
  },

  async update(ownerId: string, titleId: string, data: TitleUpdateInput): Promise<TitleHydrated | null> {
    const titlesCol = await getTitlesCollection();
    const existing = await titlesCol.findOne({ _id: titleId, ownerId });
    if (!existing) {
      return null;
    }

    const setFields: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    const directFields = [
      'mediaType',
      'englishTitle',
      'originalTitle',
      'synopsis',
      'background',
      'coverUrl',
      'coverStoragePath',
      'coverSourceType',
      'releaseYear',
      'publicationStatus',
      'startDate',
      'endDate',
      'episodeCount',
      'chapterCount',
      'sourceScore',
      'sourceRank',
      'sourcePopularity',
    ] as const;

    for (const field of directFields) {
      if (field in data) {
        const val = (data as Record<string, unknown>)[field];
        if (typeof val === 'string') {
          setFields[field] = val.trim() || null;
        } else {
          setFields[field] = val === undefined ? null : val;
        }
      }
    }

    if (data.aliases !== undefined) {
      const aliases: TitleAliasDoc[] = [];
      const seenAliases = new Set<string>();
      for (const a of data.aliases) {
        const trimmed = a.title?.trim();
        if (!trimmed || seenAliases.has(trimmed.toLowerCase())) continue;
        seenAliases.add(trimmed.toLowerCase());
        aliases.push({
          id: randomUUID(),
          alias: trimmed,
          languageCode: a.languageCode || null,
          aliasType: a.aliasType || null,
        });
      }
      setFields.aliases = aliases;
    }

    if (data.genres !== undefined) {
      const genres: TitleGenreDoc[] = [];
      const seenGenres = new Set<string>();
      for (const g of data.genres) {
        const trimmed = g.trim();
        if (!trimmed || seenGenres.has(trimmed.toLowerCase())) continue;
        seenGenres.add(trimmed.toLowerCase());
        genres.push({
          id: randomUUID(),
          name: trimmed,
          slug: trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        });
      }
      setFields.genres = genres;
    }

    if (data.tags !== undefined) {
      const tags: TitleTagDoc[] = [];
      const seenTags = new Set<string>();
      for (const tag of data.tags) {
        const trimmed = tag.trim();
        if (!trimmed || seenTags.has(trimmed.toLowerCase())) continue;
        seenTags.add(trimmed.toLowerCase());
        tags.push({
          id: randomUUID(),
          name: trimmed,
          slug: trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        });
      }
      setFields.tags = tags;
    }

    await titlesCol.updateOne({ _id: titleId, ownerId }, { $set: setFields });
    return titlesRepository.findById(ownerId, titleId);
  },

  async delete(ownerId: string, titleId: string): Promise<boolean> {
    const titlesCol = await getTitlesCollection();
    const existing = await titlesCol.findOne({ _id: titleId, ownerId });
    if (!existing) {
      return false;
    }

    return withOptionalTransaction(async (session) => {
      // 1. Delete title document
      const delRes = await titlesCol.deleteOne({ _id: titleId, ownerId }, { session });
      if (delRes.deletedCount === 0) {
        return false;
      }

      // 2. Cascade delete bookmarks referencing this title
      const bookmarksCol = await getBookmarksCollection();
      await bookmarksCol.deleteMany({ ownerId, titleId }, { session });

      // 3. Cascade remove from collections and decrement titleCount atomically
      const collectionsCol = await getCollectionsCollection();
      await collectionsCol.updateMany(
        { ownerId, 'items.titleId': titleId },
        {
          $pull: { items: { titleId } },
          $inc: { titleCount: -1 },
          $set: { updatedAt: new Date() },
        },
        { session }
      );

      return true;
    });
  },
};
