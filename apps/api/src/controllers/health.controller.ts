import type { Request, Response, NextFunction } from 'express';
import { checkHealthDetailed } from '../repositories/mongo.js';

export const healthController = {
  getLiveness(req: Request, res: Response): void {
    res.status(200).json({
      data: {
        status: 'alive',
        liveness: 'alive',
        uptime: Math.round(process.uptime()),
        version: '1.0.0',
      },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  },

  async getHealth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dbHealth = await checkHealthDetailed();
      const isHealthy = dbHealth.connected && dbHealth.schemaReady;
      const statusCode = isHealthy ? 200 : 503;

      res.status(statusCode).json({
        data: {
          status: isHealthy ? 'healthy' : 'degraded',
          liveness: 'alive',
          readiness: isHealthy ? 'ready' : 'unready',
          database: dbHealth.connected ? 'connected' : 'disconnected',
          schema: dbHealth.schemaReady ? 'ready' : (dbHealth.connected ? 'incomplete' : 'unavailable'),
          databaseTarget: dbHealth.target,
          databaseHost: dbHealth.sanitizedHost,
          tablesCount: dbHealth.collectionsCount,
          version: '1.0.0',
          uptime: Math.round(process.uptime()),
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
};
