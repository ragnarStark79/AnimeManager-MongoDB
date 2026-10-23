import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { mfaController } from '../controllers/mfa.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { loginRateLimitMiddleware } from '../middleware/login-rate-limit.middleware.js';

export const authRouter = Router();

// Native Authentication
authRouter.post('/auth/register', authController.register);
authRouter.post('/auth/login', loginRateLimitMiddleware, authController.login);
authRouter.get('/auth/me', authMiddleware, authController.getMe);
authRouter.post('/auth/logout', authController.logout);

// Two-Step Verification (MFA / TOTP)
authRouter.get('/auth/mfa/status', authMiddleware, mfaController.getStatus);
authRouter.post('/auth/mfa/setup', authMiddleware, mfaController.setup);
authRouter.post('/auth/mfa/verify-setup', authMiddleware, mfaController.verifySetup);
authRouter.post('/auth/mfa/disable', authMiddleware, mfaController.disable);
authRouter.post('/auth/mfa/recovery-codes/regenerate', authMiddleware, mfaController.regenerateRecoveryCodes);
authRouter.post('/auth/mfa/challenge-verify', loginRateLimitMiddleware, mfaController.challengeVerify);

// Development-only authentication endpoints (strictly disabled in production)
authRouter.get('/auth/dev-session', authController.getDevSession);
authRouter.post('/auth/dev-token', authController.getDevSession);

