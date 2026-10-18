import { Router } from 'express';
import { titlesController } from '../controllers/titles.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { titleCreateSchema, titleUpdateSchema } from '@animemanager/shared';
import { uuidParamSchema, titlesQuerySchema, deleteTitleQuerySchema } from '../schemas/index.js';

export const titlesRouter = Router();

titlesRouter.get(
  '/titles',
  authMiddleware,
  validate({ query: titlesQuerySchema }),
  titlesController.list
);

titlesRouter.post(
  '/titles',
  authMiddleware,
  validate({ body: titleCreateSchema }),
  titlesController.create
);

titlesRouter.get(
  '/titles/:id',
  authMiddleware,
  validate({ params: uuidParamSchema }),
  titlesController.getById
);

titlesRouter.patch(
  '/titles/:id',
  authMiddleware,
  validate({ params: uuidParamSchema, body: titleUpdateSchema }),
  titlesController.update
);

titlesRouter.delete(
  '/titles/:id',
  authMiddleware,
  validate({ params: uuidParamSchema, query: deleteTitleQuerySchema }),
  titlesController.delete
);
