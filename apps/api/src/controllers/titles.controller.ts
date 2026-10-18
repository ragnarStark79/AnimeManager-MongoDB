import type { Request, Response, NextFunction } from 'express';
import { titlesService } from '../services/titles.service.js';

export const titlesController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ownerId = req.user!.id;
      const result = await titlesService.listTitles(ownerId, req.query as any);

      res.status(200).json({
        data: result.items,
        pagination: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: result.totalPages,
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

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ownerId = req.user!.id;
      const title = await titlesService.getTitleById(ownerId, req.params.id);

      res.status(200).json({
        data: title,
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ownerId = req.user!.id;
      const title = await titlesService.createTitle(ownerId, req.body);

      res.status(201).json({
        data: title,
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ownerId = req.user!.id;
      const updated = await titlesService.updateTitle(ownerId, req.params.id, req.body);

      res.status(200).json({
        data: updated,
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ownerId = req.user!.id;
      const confirm = req.query.confirm as string | undefined;
      await titlesService.deleteTitle(ownerId, req.params.id, confirm);

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};
