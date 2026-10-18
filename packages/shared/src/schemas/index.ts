import { z } from 'zod';
import {
  MEDIA_TYPES,
  BOOKMARK_STATUSES,
  PROGRESS_UNITS,
  COVER_SOURCE_TYPES,
  COLLECTION_SORT_MODES,
} from '../constants/index.js';

export const mediaTypeSchema = z.enum(MEDIA_TYPES);
export const bookmarkStatusSchema = z.enum(BOOKMARK_STATUSES);
export const progressUnitSchema = z.enum(PROGRESS_UNITS);
export const coverSourceTypeSchema = z.enum(COVER_SOURCE_TYPES);
export const collectionSortModeSchema = z.enum(COLLECTION_SORT_MODES);

export const titleAliasSchema = z.object({
  title: z.string().trim().min(1, 'Alias title cannot be empty'),
  languageCode: z.string().trim().max(10).optional().nullable(),
  aliasType: z.enum(['native', 'romanized', 'translated', 'other']).optional().nullable(),
});

export const titleCreateSchema = z.object({
  mediaType: mediaTypeSchema,
  englishTitle: z.string().trim().min(1, 'English display title is required'),
  originalTitle: z.string().trim().optional().nullable(),
  aliases: z.array(titleAliasSchema).optional().default([]),
  synopsis: z.string().trim().optional().nullable(),
  background: z.string().trim().optional().nullable(),
  coverUrl: z.string().url('Must be a valid URL').optional().nullable().or(z.literal('')),
  coverStoragePath: z.string().trim().optional().nullable(),
  coverSourceType: coverSourceTypeSchema.optional().default('none'),
  releaseYear: z.number().int().min(1900).max(2100).optional().nullable(),
  publicationStatus: z.string().trim().optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
  episodeCount: z.number().int().min(0, 'Episode count cannot be negative').optional().nullable(),
  chapterCount: z.number().int().min(0, 'Chapter count cannot be negative').optional().nullable(),
  sourceScore: z.number().min(0).max(10).optional().nullable(),
  sourceRank: z.number().int().min(1).optional().nullable(),
  sourcePopularity: z.number().int().min(1).optional().nullable(),
  genres: z.array(z.string().trim().min(1)).optional().default([]),
  tags: z.array(z.string().trim().min(1)).optional().default([]),
});

export const titleUpdateSchema = titleCreateSchema.partial();

export const collectionCreateSchema = z.object({
  name: z.string().trim().min(1, 'Collection name is required').max(100, 'Collection name too long'),
  description: z.string().trim().max(1000).optional().nullable(),
  coverUrl: z.string().url().optional().nullable().or(z.literal('')),
  icon: z.string().trim().max(50).optional().nullable(),
  color: z.string().trim().max(50).optional().nullable(),
  sortMode: collectionSortModeSchema.optional().default('date_added'),
});

export const collectionUpdateSchema = collectionCreateSchema.partial();

export const bookmarkCreateSchema = z.object({
  titleId: z.string().uuid('Invalid Title UUID'),
  status: bookmarkStatusSchema,
  progress: z.number().int().min(0, 'Progress cannot be negative').default(0),
  progressUnit: progressUnitSchema.default('episode'),
  progressTotal: z.number().int().min(0, 'Total progress cannot be negative').optional().nullable(),
  priority: z.number().int().min(1).max(5, 'Priority must be between 1 and 5').optional().nullable(),
  personalRating: z.number().min(0).max(10, 'Personal rating must be between 0 and 10').optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  startedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
  completedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
});

export const bookmarkUpdateSchema = bookmarkCreateSchema.omit({ titleId: true }).partial();

export const importSearchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Search query cannot be empty').max(100, 'Search query too long'),
  type: z.enum(['anime', 'manga']),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(25).default(10),
});

export const importPreviewQuerySchema = z
  .object({
    url: z.string().trim().optional(),
    id: z.coerce.number().int().positive().optional(),
    type: z.enum(['anime', 'manga']).optional(),
  })
  .refine(
    (data) => Boolean(data.url) || (Boolean(data.id) && Boolean(data.type)),
    { message: 'Either url, or both id and type must be provided' }
  );

export const importDraftSchema = z.object({
  provider: z.literal('myanimelist'),
  externalId: z.string().trim().min(1),
  sourceUrl: z.string().url(),
  mediaType: mediaTypeSchema,
  needsMediaConfirmation: z.boolean().default(false),
  englishTitle: z.string().trim().min(1, 'Title cannot be blank'),
  originalTitle: z.string().trim().nullable().optional(),
  aliases: z.array(titleAliasSchema).default([]),
  synopsis: z.string().trim().nullable().optional(),
  background: z.string().trim().nullable().optional(),
  coverUrl: z.string().url().nullable().optional().or(z.literal('')),
  releaseYear: z.number().int().min(1900).max(2100).nullable().optional(),
  publicationStatus: z.string().trim().nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').nullable().optional(),
  episodeCount: z.number().int().min(0).nullable().optional(),
  chapterCount: z.number().int().min(0).nullable().optional(),
  sourceScore: z.number().min(0).max(10).nullable().optional(),
  sourceRank: z.number().int().min(1).nullable().optional(),
  sourcePopularity: z.number().int().min(1).nullable().optional(),
  genres: z.array(z.string().trim().min(1)).default([]),
  tags: z.array(z.string().trim().min(1)).default([]),
  sourceRetrievedAt: z.string(),
  warnings: z.array(z.string()).default([]),
  duplicateExistingTitleId: z.string().uuid().nullable().optional(),
  duplicateExistingTitleName: z.string().nullable().optional(),
});

export const importFieldSelectionSchema = z.object({
  englishTitle: z.boolean().default(true),
  originalTitle: z.boolean().default(true),
  aliases: z.boolean().default(true),
  synopsis: z.boolean().default(true),
  background: z.boolean().default(false),
  coverUrl: z.boolean().default(true),
  releaseYear: z.boolean().default(true),
  publicationStatus: z.boolean().default(true),
  startDate: z.boolean().default(true),
  endDate: z.boolean().default(true),
  episodeCount: z.boolean().default(true),
  chapterCount: z.boolean().default(true),
  sourceScore: z.boolean().default(true),
  sourceRank: z.boolean().default(true),
  sourcePopularity: z.boolean().default(true),
  genres: z.boolean().default(true),
  tags: z.boolean().default(true),
}).default({
  englishTitle: true,
  originalTitle: true,
  aliases: true,
  synopsis: true,
  background: false,
  coverUrl: true,
  releaseYear: true,
  publicationStatus: true,
  startDate: true,
  endDate: true,
  episodeCount: true,
  chapterCount: true,
  sourceScore: true,
  sourceRank: true,
  sourcePopularity: true,
  genres: true,
  tags: true,
});

export const importCommitSchema = z.object({
  draft: importDraftSchema,
  selectedFields: importFieldSelectionSchema.default({}),
  overrides: titleUpdateSchema.optional(),
  confirmedMediaType: mediaTypeSchema.optional(),
  initialBookmark: bookmarkCreateSchema.omit({ titleId: true }).optional(),
  collectionIds: z.array(z.string().uuid()).optional().default([]),
});
