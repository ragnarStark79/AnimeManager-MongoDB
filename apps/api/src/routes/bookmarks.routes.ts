import { Router } from 'express';
import { bookmarksController } from '../controllers/bookmarks.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { bookmarkCreateSchema, bookmarkUpdateSchema } from '@animemanager/shared';
import {
  uuidParamSchema,
  bookmarksQuerySchema,
  titleBookmarkUpsertSchema,
} from '../schemas/index.js';

export const bookmarksRouter = Router();

bookmarksRouter.get(
  '/bookmarks',
  authMiddleware,
  validate({ query: bookmarksQuerySchema }),
  bookmarksController.list
);

bookmarksRouter.post(
  '/bookmarks',
  authMiddleware,
  validate({ body: bookmarkCreateSchema }),
  bookmarksController.create
);

bookmarksRouter.get(
  '/bookmarks/:id',
  authMiddleware,
  validate({ params: uuidParamSchema }),
  bookmarksController.getById
);

bookmarksRouter.patch(
  '/bookmarks/:id',
  authMiddleware,
  validate({ params: uuidParamSchema, body: bookmarkUpdateSchema }),
  bookmarksController.update
);

bookmarksRouter.delete(
  '/bookmarks/:id',
  authMiddleware,
  validate({ params: uuidParamSchema }),
  bookmarksController.delete
);

bookmarksRouter.put(
  '/titles/:id/bookmark',
  authMiddleware,
  validate({ params: uuidParamSchema, body: titleBookmarkUpsertSchema }),
  bookmarksController.upsertTitleBookmark
);
