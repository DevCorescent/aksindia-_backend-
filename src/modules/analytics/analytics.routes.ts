import { Router } from 'express';
import { analyticsController } from './analytics.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

router.get('/activities',     authenticate, requireRole('admin'), analyticsController.activities);
router.get('/abandoned-carts', authenticate, requireRole('admin'), analyticsController.abandonedCarts);
router.post('/track',          authenticate, analyticsController.track);

export default router;
