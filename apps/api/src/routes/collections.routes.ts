import { Router } from 'express';
import { collectionsController } from '../controllers/collections.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { collectionCreateSchema, collectionUpdateSchema } from '@animemanager/shared';
import {
  uuidParamSchema,
  collectionTitleParamSchema,
  addCollectionTitlesSchema,
  reorderCollectionTitlesSchema,
} from '../schemas/index.js';

export const collectionsRouter = Router();

collectionsRouter.get(
  '/collections',
  authMiddleware,
  collectionsController.list
);

collectionsRouter.post(
  '/collections',
  authMiddleware,
  validate({ body: collectionCreateSchema }),
  collectionsController.create
);

collectionsRouter.get(
  '/collections/:id',
  authMiddleware,
  validate({ params: uuidParamSchema }),
  collectionsController.getById
);

collectionsRouter.patch(
  '/collections/:id',
  authMiddleware,
  validate({ params: uuidParamSchema, body: collectionUpdateSchema }),
  collectionsController.update
);

collectionsRouter.delete(
  '/collections/:id',
  authMiddleware,
  validate({ params: uuidParamSchema }),
  collectionsController.delete
);

collectionsRouter.post(
  '/collections/:id/titles',
  authMiddleware,
  validate({ params: uuidParamSchema, body: addCollectionTitlesSchema }),
  collectionsController.addTitles
);

collectionsRouter.delete(
  '/collections/:id/titles/:titleId',
  authMiddleware,
  validate({ params: collectionTitleParamSchema }),
  collectionsController.removeTitle
);

collectionsRouter.patch(
  '/collections/:id/order',
  authMiddleware,
  validate({ params: uuidParamSchema, body: reorderCollectionTitlesSchema }),
  collectionsController.reorderTitles
);
