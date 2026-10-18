import type { Request, Response, NextFunction } from 'express';
import { exportService } from '../services/export.service.js';

export const exportController = {
  async exportJson(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ownerId = req.user!.id;
      const data = await exportService.exportJson(ownerId);
      const dateStr = new Date().toISOString().slice(0, 10);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="animemanager_backup_${dateStr}.json"`
      );
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  },

  async exportCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ownerId = req.user!.id;
      const csv = await exportService.exportCsv(ownerId);
      const dateStr = new Date().toISOString().slice(0, 10);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="animemanager_titles_${dateStr}.csv"`
      );
      res.status(200).send(csv);
    } catch (err) {
      next(err);
    }
  },
};
