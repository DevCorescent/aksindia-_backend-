import { Router } from 'express';
import { notificationsController } from './notifications.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

router.get('/me',          authenticate, notificationsController.list);
router.patch('/me/read-all', authenticate, notificationsController.markAllRead);
router.post('/',           authenticate, requireRole('admin'), notificationsController.create);
router.patch('/:id/read',  authenticate, notificationsController.markRead);
router.delete('/:id',      authenticate, notificationsController.remove);

export default router;
