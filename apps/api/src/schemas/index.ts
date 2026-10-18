import { z } from 'zod';
import {
  mediaTypeSchema,
  bookmarkStatusSchema,
  bookmarkCreateSchema,
} from '@animemanager/shared';

export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID identifier'),
});

export const collectionTitleParamSchema = z.object({
  id: z.string().uuid('Invalid Collection UUID'),
  titleId: z.string().uuid('Invalid Title UUID'),
});

export const titlesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
  search: z.string().trim().max(200).optional(),
  mediaType: mediaTypeSchema.optional(),
  collectionId: z.string().uuid('Invalid Collection UUID').optional(),
  bookmarkStatus: bookmarkStatusSchema.optional(),
  sortBy: z.enum(['title', 'createdAt', 'updatedAt', 'releaseYear', 'personalRating']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const deleteTitleQuerySchema = z.object({
  confirm: z.string().optional(),
});

export const addCollectionTitlesSchema = z.object({
  titleIds: z.array(z.string().uuid('Invalid Title UUID')).min(1, 'At least one titleId is required'),
});

export const reorderCollectionTitlesSchema = z.object({
  order: z.array(
    z.object({
      titleId: z.string().uuid('Invalid Title UUID'),
      position: z.number().int(),
    })
  ).min(1, 'Order array cannot be empty'),
});

export const bookmarksQuerySchema = z.object({
  status: bookmarkStatusSchema.optional(),
  mediaType: mediaTypeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
  sortBy: z.enum(['updatedAt', 'createdAt', 'personalRating', 'priority', 'progress']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const titleBookmarkUpsertSchema = bookmarkCreateSchema.omit({ titleId: true });
