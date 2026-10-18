import express, { type Router } from 'express';
import { importController } from '../controllers/import.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { importRateLimitMiddleware } from '../middleware/rate-limit.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import {
  importSearchQuerySchema,
  importPreviewQuerySchema,
  importCommitSchema,
} from '@animemanager/shared';

export const importRouter: Router = express.Router();

importRouter.get(
  '/import/jikan/search',
  authMiddleware,
  importRateLimitMiddleware,
  validate({ query: importSearchQuerySchema }),
  importController.search
);

importRouter.get(
  '/import/preview',
  authMiddleware,
  importRateLimitMiddleware,
  validate({ query: importPreviewQuerySchema }),
  importController.preview
);

importRouter.post(
  '/import/commit',
  authMiddleware,
  importRateLimitMiddleware,
  validate({ body: importCommitSchema }),
  importController.commit
);
