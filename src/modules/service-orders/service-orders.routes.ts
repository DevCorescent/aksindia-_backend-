import { Router } from 'express';
import { serviceOrdersController } from './service-orders.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.get('/',      authenticate, serviceOrdersController.list);
router.get('/:id',   authenticate, serviceOrdersController.getById);
router.post('/',     authenticate, serviceOrdersController.create);
router.patch('/:id', authenticate, serviceOrdersController.update);

export default router;
