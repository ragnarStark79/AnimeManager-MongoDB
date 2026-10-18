import { Router } from 'express';
import { exportController } from '../controllers/export.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

export const exportRouter = Router();

exportRouter.get('/export/json', authMiddleware, exportController.exportJson);
exportRouter.get('/export/csv', authMiddleware, exportController.exportCsv);
