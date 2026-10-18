import { z } from 'zod';
import {
  titleCreateSchema,
  titleUpdateSchema,
  titleAliasSchema,
  collectionCreateSchema,
  collectionUpdateSchema,
  bookmarkCreateSchema,
  bookmarkUpdateSchema,
  importSearchQuerySchema,
  importPreviewQuerySchema,
  importDraftSchema,
  importFieldSelectionSchema,
  importCommitSchema,
} from '../schemas/index.js';
import {
  MediaType,
  BookmarkStatus,
  ProgressUnit,
  CoverSourceType,
  CollectionSortMode,
} from '../constants/index.js';

export * from '../constants/index.js';

export type TitleCreateInput = z.infer<typeof titleCreateSchema>;
export type TitleUpdateInput = z.infer<typeof titleUpdateSchema>;
export type TitleAliasInput = z.infer<typeof titleAliasSchema>;

export type CollectionCreateInput = z.infer<typeof collectionCreateSchema>;
export type CollectionUpdateInput = z.infer<typeof collectionUpdateSchema>;

export type BookmarkCreateInput = z.infer<typeof bookmarkCreateSchema>;
export type BookmarkUpdateInput = z.infer<typeof bookmarkUpdateSchema>;

export type ImportSearchQuery = z.infer<typeof importSearchQuerySchema>;
export type ImportPreviewQuery = z.infer<typeof importPreviewQuerySchema>;
export type ImportDraft = z.infer<typeof importDraftSchema>;
export type ImportFieldSelection = z.infer<typeof importFieldSelectionSchema>;
export type ImportCommitInput = z.infer<typeof importCommitSchema>;

export interface ImportSearchResultItem {
  malId: number;
  mediaType: MediaType;
  sourceType: string | null;
  englishTitle: string;
  originalTitle: string | null;
  romanizedTitle: string | null;
  coverUrl: string | null;
  synopsisSnippet: string | null;
  sourceScore: number | null;
  sourceRank: number | null;
  publicationStatus: string | null;
  releaseYear: number | null;
}

export interface ImportSearchResponse {
  items: ImportSearchResultItem[];
  page: number;
  hasNextPage: boolean;
}


export interface TitleEntity {
  id: string;
  ownerId: string;
  mediaType: MediaType;
  englishTitle: string;
  originalTitle: string | null;
  synopsis: string | null;
  background: string | null;
  coverUrl: string | null;
  coverStoragePath: string | null;
  coverSourceType: CoverSourceType;
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
}

export interface CollectionEntity {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  icon: string | null;
  color: string | null;
  sortMode: CollectionSortMode;
  createdAt: string;
  updatedAt: string;
}

export interface BookmarkEntity {
  id: string;
  ownerId: string;
  titleId: string;
  status: BookmarkStatus;
  progress: number;
  progressUnit: ProgressUnit;
  progressTotal: number | null;
  priority: number | null;
  personalRating: number | null;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalSourceEntity {
  id: string;
  titleId: string;
  provider: string;
  externalId: string;
  sourceUrl: string | null;
  lastFetchedAt: string | null;
  createdAt: string;
}
