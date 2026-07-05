import { Router } from 'express';
import { serviceOrdersController } from './service-orders.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

router.get('/',                  authenticate, serviceOrdersController.list);
router.get('/:id',               authenticate, serviceOrdersController.getById);
router.post('/',                 authenticate, serviceOrdersController.create);
router.patch('/:id',             authenticate, requireRole('admin', 'service_provider'), serviceOrdersController.update);
router.post('/:id/complete',     authenticate, requireRole('admin', 'service_provider'), serviceOrdersController.complete);
router.post('/:id/cancel',       authenticate, serviceOrdersController.cancel);
router.post('/:id/reject',       authenticate, requireRole('service_provider', 'admin'), serviceOrdersController.reject);

export default router;
