import type { Request, Response, NextFunction } from 'express';
import { importService } from '../services/import/import.service.js';
import type { ImportSearchQuery, ImportPreviewQuery, ImportCommitInput } from '@animemanager/shared';

export const importController = {
  async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as ImportSearchQuery;
      const result = await importService.search(query, req.requestId);

      res.status(200).json({
        data: result.items,
        pagination: {
          page: result.page,
          hasNextPage: result.hasNextPage,
        },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async preview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ownerId = req.user!.id;
      const query = req.query as unknown as ImportPreviewQuery;
      const draft = await importService.preview(ownerId, query, req.requestId);

      res.status(200).json({
        data: draft,
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async commit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ownerId = req.user!.id;
      const body = req.body as ImportCommitInput;
      const created = await importService.commit(ownerId, body);

      res.status(201).json({
        data: created,
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
