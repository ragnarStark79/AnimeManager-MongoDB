import type { Request, Response, NextFunction } from 'express';
import { bookmarksService } from '../services/bookmarks.service.js';

export const bookmarksController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ownerId = req.user!.id;
      const result = await bookmarksService.listBookmarks(ownerId, req.query as any);

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
      const bookmark = await bookmarksService.getBookmarkById(ownerId, req.params.id);

      res.status(200).json({
        data: bookmark,
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
      const bookmark = await bookmarksService.createBookmark(ownerId, req.body);

      res.status(201).json({
        data: bookmark,
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
      const updated = await bookmarksService.updateBookmark(ownerId, req.params.id, req.body);

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
      await bookmarksService.deleteBookmark(ownerId, req.params.id);

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async upsertTitleBookmark(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ownerId = req.user!.id;
      const titleId = req.params.id;
      const bookmark = await bookmarksService.upsertTitleBookmark(ownerId, titleId, req.body);

      res.status(200).json({
        data: bookmark,
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
