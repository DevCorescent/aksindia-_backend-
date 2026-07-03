import { Router } from 'express';
import { servicesController } from './services.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

router.get('/',       authenticate, servicesController.list);
router.get('/:id',    authenticate, servicesController.getById);
router.post('/',      authenticate, requireRole('admin', 'service_provider'), servicesController.create);
router.patch('/:id',  authenticate, requireRole('admin', 'service_provider'), servicesController.update);
router.delete('/:id', authenticate, requireRole('admin', 'service_provider'), servicesController.remove);

export default router;
