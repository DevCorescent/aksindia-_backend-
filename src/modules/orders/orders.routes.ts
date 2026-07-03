import { Router } from 'express';
import { ordersController } from './orders.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.get('/',      authenticate, ordersController.list);
router.get('/:id',   authenticate, ordersController.getById);
router.post('/',     authenticate, ordersController.create);
router.patch('/:id', authenticate, ordersController.update);

export default router;
