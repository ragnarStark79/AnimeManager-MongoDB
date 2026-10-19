import { Router } from 'express';
import { adminController } from '../controllers/admin.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireRootAdmin, requireSuperAdminOrRoot } from '../middleware/admin.middleware.js';

export const adminRouter = Router();

// Base middleware: All administrative routes require an authenticated session
adminRouter.use('/admin', authMiddleware);

// ── Root Administrator ONLY: Super Admin Management, Full Audit, System Metrics ──
adminRouter.get('/admin/super-admins', requireRootAdmin, adminController.listSuperAdmins);
adminRouter.post('/admin/super-admins', requireRootAdmin, adminController.createSuperAdmin);
adminRouter.patch('/admin/super-admins/:id/status', requireRootAdmin, adminController.updateSuperAdminStatus);
adminRouter.delete('/admin/super-admins/:id', requireRootAdmin, adminController.deleteSuperAdmin);
adminRouter.post('/admin/super-admins/:id/revoke-sessions', requireRootAdmin, adminController.revokeSuperAdminSessions);
adminRouter.get('/admin/audit-logs', requireRootAdmin, adminController.getAuditLogs);
adminRouter.get('/admin/system-stats', requireRootAdmin, adminController.getSystemStats);

// ── Root Administrator & Super Administrator: Ordinary User Management & Privacy-Safe Activity ──
adminRouter.get('/admin/users', requireSuperAdminOrRoot, adminController.listUsers);
adminRouter.get('/admin/users/:id', requireSuperAdminOrRoot, adminController.getUserById);
adminRouter.patch('/admin/users/:id/status', requireSuperAdminOrRoot, adminController.updateUserStatus);
adminRouter.delete('/admin/users/:id', requireSuperAdminOrRoot, adminController.deleteUser);
adminRouter.post('/admin/users/:id/revoke-sessions', requireSuperAdminOrRoot, adminController.revokeUserSessions);
adminRouter.get('/admin/user-activity', requireSuperAdminOrRoot, adminController.getUserActivity);
