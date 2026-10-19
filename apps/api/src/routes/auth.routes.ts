import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { loginRateLimitMiddleware } from '../middleware/login-rate-limit.middleware.js';

export const authRouter = Router();

// Native Authentication
authRouter.post('/auth/register', authController.register);
authRouter.post('/auth/login', loginRateLimitMiddleware, authController.login);
authRouter.get('/auth/me', authMiddleware, authController.getMe);
authRouter.post('/auth/logout', authController.logout);

// Development-only authentication endpoints (strictly disabled in production)
authRouter.get('/auth/dev-session', authController.getDevSession);
authRouter.post('/auth/dev-token', authController.getDevSession);
