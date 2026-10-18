import { randomUUID } from 'node:crypto';
import {
  getTitlesCollection,
  getCollectionsCollection,
  getBookmarksCollection,
  withOptionalTransaction,
  type TitleDocument,
  type BookmarkDocument,
  type TitleAliasDoc,
  type TitleGenreDoc,
  type TitleTagDoc,
  type TitleExternalSourceDoc,
} from '../../repositories/mongo.js';
import { titlesRepository, type TitleHydrated } from '../../repositories/titles.repository.js';
import { jikanClient, JikanClient } from './jikan.client.js';
import { parseMalUrl, validateMalIdAndType } from './url-parser.js';
import { normalizeSearchCandidates, normalizeDetailDraft } from './normalizer.js';
import {
  BadRequestError,
  DuplicateImportError,
  ForbiddenError,
  ValidationError,
} from '../../errors/index.js';
import type {
  ImportSearchQuery,
  ImportPreviewQuery,
  ImportDraft,
  ImportCommitInput,
  ImportSearchResponse,
} from '@animemanager/shared';

export class ImportService {
  private readonly client: JikanClient;

  constructor(client: JikanClient = jikanClient) {
    this.client = client;
  }

  /**
   * Search anime or manga via Jikan v4 with caching and throttling.
   */
  async search(query: ImportSearchQuery, requestId?: string): Promise<ImportSearchResponse> {
    const rawData = await this.client.search(
      query.type,
      query.q,
      query.page || 1,
      query.limit || 10,
      { requestId }
    );

    const candidates = normalizeSearchCandidates(rawData.data || [], query.type);
    const hasNextPage = Boolean(rawData.pagination?.has_next_page);

    return {
      items: candidates,
      page: query.page || 1,
      hasNextPage,
    };
  }

  /**
   * Preview metadata draft for a given MyAnimeList URL or ID.
   * Performs read-only duplicate detection without mutating database.
   */
  async preview(ownerId: string, query: ImportPreviewQuery, requestId?: string): Promise<ImportDraft> {
    let target: { mediaType: 'anime' | 'manga'; id: number; canonicalUrl: string };

    if (query.url) {
      target = parseMalUrl(query.url);
      if (query.type && query.type !== target.mediaType) {
        throw new BadRequestError(
          `URL media type (${target.mediaType}) conflicts with requested media type (${query.type})`
        );
      }
    } else if (query.id && query.type) {
      target = validateMalIdAndType(query.id, query.type);
    } else {
      throw new BadRequestError('Either url, or both id and type must be provided');
    }

    // Fetch detail from Jikan
    const rawDetail = await this.client.getDetail(target.mediaType, target.id, { requestId });

    // Normalize metadata into draft
    const draft = normalizeDetailDraft(rawDetail, target.mediaType);

    // Duplicate Detection: Check if caller already imported this provider & externalId
    const titlesCol = await getTitlesCollection();
    const existing = await titlesCol.findOne({
      ownerId,
      'externalSources.provider': 'myanimelist',
      'externalSources.externalId': String(draft.externalId),
    });

    if (existing) {
      draft.duplicateExistingTitleId = existing._id;
      draft.duplicateExistingTitleName = existing.englishTitle;
      draft.warnings.push(
        `This title has already been imported into your library as '${existing.englishTitle}'.`
      );
    }

    return draft;
  }

  /**
   * Atomically commits user-reviewed metadata draft, creating Title,
   * Aliases, Genres, Tags, External Source mapping, and optional Bookmark & Collection memberships.
   */
  async commit(ownerId: string, input: ImportCommitInput): Promise<TitleHydrated> {
    const { draft, selectedFields, overrides, confirmedMediaType, initialBookmark, collectionIds } =
      input;

    const externalId = String(draft.externalId || '').trim();
    if (!externalId) {
      throw new ValidationError('External ID is required in import draft');
    }

    // 1. Duplicate Check: Block importing duplicate externalId for this owner
    const titlesCol = await getTitlesCollection();
    const existingCheck = await titlesCol.findOne({
      ownerId,
      'externalSources.provider': 'myanimelist',
      'externalSources.externalId': externalId,
    });

    if (existingCheck) {
      throw new DuplicateImportError(
        `This title has already been imported into your library as '${existingCheck.englishTitle}'.`,
        [
          {
            existingTitleId: existingCheck._id,
            existingTitle: existingCheck.englishTitle,
            provider: 'myanimelist',
            externalId,
          },
        ]
      );
    }

    // 2. Collection Ownership Verification (if collections specified)
    if (collectionIds && collectionIds.length > 0) {
      const collectionsCol = await getCollectionsCollection();
      const userCols = await collectionsCol
        .find({ _id: { $in: collectionIds }, ownerId })
        .toArray();
      if (userCols.length !== collectionIds.length) {
        throw new ForbiddenError(
          'One or more specified collections do not belong to you or do not exist'
        );
      }
    }

    // 3. Resolve Media Type
    const finalMediaType = confirmedMediaType || overrides?.mediaType || draft.mediaType;

    // 4. Resolve Selected & Overridden Fields (Server-side field selection enforcement)
    const englishTitle =
      overrides?.englishTitle?.trim() ||
      (selectedFields.englishTitle !== false ? draft.englishTitle : draft.englishTitle);

    if (!englishTitle || !englishTitle.trim()) {
      throw new ValidationError('Display title cannot be blank');
    }

    const originalTitle =
      overrides?.originalTitle !== undefined
        ? overrides.originalTitle
        : selectedFields.originalTitle
          ? draft.originalTitle
          : null;

    const synopsis =
      overrides?.synopsis !== undefined
        ? overrides.synopsis
        : selectedFields.synopsis
          ? draft.synopsis
          : null;

    const background =
      overrides?.background !== undefined
        ? overrides.background
        : selectedFields.background
          ? draft.background
          : null;

    const coverUrl =
      overrides?.coverUrl !== undefined
        ? overrides.coverUrl
        : selectedFields.coverUrl
          ? draft.coverUrl
          : null;

    const releaseYear =
      overrides?.releaseYear !== undefined
        ? overrides.releaseYear
        : selectedFields.releaseYear
          ? draft.releaseYear
          : null;

    const publicationStatus =
      overrides?.publicationStatus !== undefined
        ? overrides.publicationStatus
        : selectedFields.publicationStatus
          ? draft.publicationStatus
          : null;

    const startDate =
      overrides?.startDate !== undefined
        ? overrides.startDate
        : selectedFields.startDate
          ? draft.startDate
          : null;

    const endDate =
      overrides?.endDate !== undefined
        ? overrides.endDate
        : selectedFields.endDate
          ? draft.endDate
          : null;

    const episodeCount =
      overrides?.episodeCount !== undefined
        ? overrides.episodeCount
        : selectedFields.episodeCount
          ? draft.episodeCount
          : null;

    const chapterCount =
      overrides?.chapterCount !== undefined
        ? overrides.chapterCount
        : selectedFields.chapterCount
          ? draft.chapterCount
          : null;

    const sourceScore =
      overrides?.sourceScore !== undefined
        ? overrides.sourceScore
        : selectedFields.sourceScore
          ? draft.sourceScore
          : null;

    const sourceRank =
      overrides?.sourceRank !== undefined
        ? overrides.sourceRank
        : selectedFields.sourceRank
          ? draft.sourceRank
          : null;

    const sourcePopularity =
      overrides?.sourcePopularity !== undefined
        ? overrides.sourcePopularity
        : selectedFields.sourcePopularity
          ? draft.sourcePopularity
          : null;

    const rawAliases =
      overrides?.aliases !== undefined
        ? overrides.aliases
        : selectedFields.aliases
          ? draft.aliases
          : [];

    const rawGenres =
      overrides?.genres !== undefined
        ? overrides.genres
        : selectedFields.genres
          ? draft.genres
          : [];

    const rawTags =
      overrides?.tags !== undefined
        ? overrides.tags
        : selectedFields.tags
          ? draft.tags
          : [];

    // Deduplicate aliases
    const aliases: TitleAliasDoc[] = [];
    const seenAliases = new Set<string>();
    for (const a of rawAliases) {
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

    // Deduplicate genres
    const genres: TitleGenreDoc[] = [];
    const seenGenres = new Set<string>();
    for (const g of rawGenres) {
      const trimmed = g.trim();
      if (!trimmed || seenGenres.has(trimmed.toLowerCase())) continue;
      seenGenres.add(trimmed.toLowerCase());
      genres.push({
        id: randomUUID(),
        name: trimmed,
        slug: trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      });
    }

    // Deduplicate tags
    const tags: TitleTagDoc[] = [];
    const seenTags = new Set<string>();
    for (const t of rawTags) {
      const trimmed = t.trim();
      if (!trimmed || seenTags.has(trimmed.toLowerCase())) continue;
      seenTags.add(trimmed.toLowerCase());
      tags.push({
        id: randomUUID(),
        name: trimmed,
        slug: trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      });
    }

    const externalSources: TitleExternalSourceDoc[] = [
      {
        id: randomUUID(),
        provider: 'myanimelist',
        externalId,
        sourceUrl: draft.sourceUrl || null,
        lastFetchedAt: new Date(),
      },
    ];

    const now = new Date();
    const newTitleId = randomUUID();

    const titleDoc: TitleDocument = {
      _id: newTitleId,
      ownerId,
      mediaType: finalMediaType,
      englishTitle: englishTitle.trim(),
      originalTitle: originalTitle?.trim() || null,
      synopsis: synopsis?.trim() || null,
      background: background?.trim() || null,
      coverUrl: coverUrl || null,
      coverStoragePath: null,
      coverSourceType: coverUrl ? 'provider' : 'none',
      releaseYear: releaseYear ?? null,
      publicationStatus: publicationStatus || null,
      startDate: startDate || null,
      endDate: endDate || null,
      episodeCount: episodeCount ?? null,
      chapterCount: chapterCount ?? null,
      sourceScore: sourceScore ?? null,
      sourceRank: sourceRank ?? null,
      sourcePopularity: sourcePopularity ?? null,
      aliases,
      genres,
      tags,
      externalSources,
      createdAt: now,
      updatedAt: now,
    };

    // 5. Execute Atomic Creation
    await withOptionalTransaction(async (session) => {
      // 5.1 Insert Title
      await titlesCol.insertOne(titleDoc, { session });

      // 5.2 Optional Initial Bookmark
      if (initialBookmark) {
        if (initialBookmark.progress !== undefined && initialBookmark.progress < 0) {
          throw new ValidationError('Progress cannot be negative');
        }
        if (
          initialBookmark.progress !== undefined &&
          initialBookmark.progressTotal !== undefined &&
          initialBookmark.progressTotal !== null &&
          initialBookmark.progress > initialBookmark.progressTotal
        ) {
          throw new ValidationError('Progress cannot exceed total progress');
        }
        if (
          initialBookmark.personalRating !== undefined &&
          initialBookmark.personalRating !== null &&
          (initialBookmark.personalRating < 0 || initialBookmark.personalRating > 10)
        ) {
          throw new ValidationError('Personal rating must be between 0 and 10');
        }

        const bookmarksCol = await getBookmarksCollection();
        const bookmarkDoc: BookmarkDocument = {
          _id: randomUUID(),
          ownerId,
          titleId: newTitleId,
          status: initialBookmark.status,
          progress: initialBookmark.progress ?? 0,
          progressUnit:
            initialBookmark.progressUnit ?? (finalMediaType === 'anime' ? 'episode' : 'chapter'),
          progressTotal:
            (initialBookmark.progressTotal ?? (finalMediaType === 'anime' ? episodeCount : chapterCount)) ?? null,
          priority: initialBookmark.priority ?? null,
          personalRating: initialBookmark.personalRating ?? null,
          notes: initialBookmark.notes ?? null,
          startedAt: initialBookmark.startedAt ?? null,
          completedAt: initialBookmark.completedAt ?? null,
          createdAt: now,
          updatedAt: now,
        };
        await bookmarksCol.insertOne(bookmarkDoc, { session });
      }

      // 5.3 Optional Collection Memberships
      if (collectionIds && collectionIds.length > 0) {
        const collectionsCol = await getCollectionsCollection();
        for (let i = 0; i < collectionIds.length; i++) {
          const colId = collectionIds[i];
          const colDoc = await collectionsCol.findOne({ _id: colId, ownerId }, { session });
          const currentItems = colDoc?.items || [];
          const maxPos = currentItems.reduce((m, item) => Math.max(m, item.position || 0), 0);

          await collectionsCol.updateOne(
            { _id: colId, ownerId, 'items.titleId': { $ne: newTitleId } },
            {
              $push: {
                items: {
                  titleId: newTitleId,
                  position: maxPos + 1,
                  addedAt: now,
                },
              },
              $inc: { titleCount: 1 },
              $set: { updatedAt: now },
            },
            { session }
          );
        }
      }
    });

    // 6. Return fully hydrated title
    const created = await titlesRepository.findById(ownerId, newTitleId);
    if (!created) {
      throw new Error('Failed to retrieve newly imported title');
    }
    return created;
  }
}

export const importService = new ImportService();
