import { Router } from 'express';
import { analyticsController } from './analytics.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

const adminOnly = [authenticate, requireRole('admin')];

router.get('/activities',      ...adminOnly, analyticsController.activities);
router.get('/abandoned-carts', ...adminOnly, analyticsController.abandonedCarts);
router.get('/revenue-trend',   ...adminOnly, analyticsController.revenueTrend);
router.get('/top-products',    ...adminOnly, analyticsController.topProducts);
router.get('/events',          ...adminOnly, analyticsController.eventSummary);
router.post('/track',           authenticate, analyticsController.track);

export default router;
