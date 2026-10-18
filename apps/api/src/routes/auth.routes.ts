import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';

export const authRouter = Router();

// Development-only authentication endpoints (strictly disabled in production)
authRouter.get('/auth/dev-session', authController.getDevSession);
authRouter.post('/auth/dev-token', authController.getDevSession);
