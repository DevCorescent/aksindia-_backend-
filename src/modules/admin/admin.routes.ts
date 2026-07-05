import { Router } from 'express';
import { adminController } from './admin.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

const adminOnly = [authenticate, requireRole('admin')];

router.get('/stats',          ...adminOnly, adminController.dashboardStats);
router.get('/users',          ...adminOnly, adminController.listUsers);
router.patch('/users/:id',    ...adminOnly, adminController.updateUser);
router.delete('/users/:id',   ...adminOnly, adminController.deleteUser);
router.get('/roles',          ...adminOnly, adminController.listRoles);
router.post('/roles',         ...adminOnly, adminController.createRole);
router.patch('/roles/:id',    ...adminOnly, adminController.updateRole);
router.delete('/roles/:id',   ...adminOnly, adminController.deleteRole);
router.get('/revenue',        ...adminOnly, adminController.revenue);

export default router;
