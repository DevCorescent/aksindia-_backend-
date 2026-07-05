import { Router } from 'express';
import { ordersController } from './orders.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

router.get('/',             authenticate, ordersController.list);
router.get('/:id',          authenticate, ordersController.getById);
router.post('/',            authenticate, ordersController.create);
router.patch('/:id',        authenticate, requireRole('admin', 'store_owner'), ordersController.update);
router.post('/:id/cancel',  authenticate, ordersController.cancel);

export default router;
