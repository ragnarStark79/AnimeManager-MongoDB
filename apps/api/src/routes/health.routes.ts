import { Router } from 'express';
import { healthController } from '../controllers/health.controller.js';

export const healthRouter = Router();

healthRouter.get('/health', healthController.getHealth);
healthRouter.get('/health/liveness', healthController.getLiveness);
healthRouter.get('/health/readiness', healthController.getHealth);

