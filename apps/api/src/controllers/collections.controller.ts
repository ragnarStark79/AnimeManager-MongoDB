import type { Request, Response, NextFunction } from 'express';
import { collectionsService } from '../services/collections.service.js';

export const collectionsController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ownerId = req.user!.id;
      const collections = await collectionsService.listCollections(ownerId);

      res.status(200).json({
        data: collections,
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
      const collection = await collectionsService.getCollectionById(ownerId, req.params.id);

      res.status(200).json({
        data: collection,
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
      const collection = await collectionsService.createCollection(ownerId, req.body);

      res.status(201).json({
        data: collection,
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
      const updated = await collectionsService.updateCollection(ownerId, req.params.id, req.body);

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
      await collectionsService.deleteCollection(ownerId, req.params.id);

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async addTitles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ownerId = req.user!.id;
      await collectionsService.addTitles(ownerId, req.params.id, req.body.titleIds);

      res.status(200).json({
        data: { success: true },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async removeTitle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ownerId = req.user!.id;
      await collectionsService.removeTitle(ownerId, req.params.id, req.params.titleId);

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async reorderTitles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ownerId = req.user!.id;
      await collectionsService.reorderTitles(ownerId, req.params.id, req.body.order);

      res.status(200).json({
        data: { success: true },
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
