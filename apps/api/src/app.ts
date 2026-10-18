import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/index.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import { healthRouter } from './routes/health.routes.js';
import { titlesRouter } from './routes/titles.routes.js';
import { collectionsRouter } from './routes/collections.routes.js';
import { bookmarksRouter } from './routes/bookmarks.routes.js';
import { importRouter } from './routes/import.routes.js';
import { exportRouter } from './routes/export.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { NotFoundError } from './errors/index.js';

export function createApp(): Express {
  const app = express();

  // Security and core middleware
  app.use(helmet());
  const allowedOrigins = config.CORS_ORIGIN.includes(',')
    ? config.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
    : config.CORS_ORIGIN;

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
      exposedHeaders: ['X-Request-ID'],
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(requestIdMiddleware);

  // Mount API v1 routes (supports direct /api/v1 and serverless /v1 mounts)
  const apiRouter = express.Router();
  apiRouter.use(healthRouter);
  apiRouter.use(authRouter);
  apiRouter.use(titlesRouter);
  apiRouter.use(collectionsRouter);
  apiRouter.use(bookmarksRouter);
  apiRouter.use(importRouter);
  apiRouter.use(exportRouter);

  app.use('/api/v1', apiRouter);
  app.use('/v1', apiRouter);

  // 404 handler for unknown endpoints
  app.use((_req, _res, next) => {
    next(new NotFoundError('The requested API endpoint does not exist'));
  });

  // Centralized error handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
