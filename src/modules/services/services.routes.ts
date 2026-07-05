import { Router } from 'express';
import { servicesController } from './services.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

// Public – no auth
router.get('/public',          servicesController.listPublic);
router.get('/public/featured', servicesController.featured);
router.get('/public/search',   servicesController.search);
router.get('/public/:id',      servicesController.getById);

// Authenticated
router.get('/',      authenticate, servicesController.list);
router.get('/:id',   authenticate, servicesController.getById);
router.post('/',     authenticate, requireRole('admin', 'service_provider'), servicesController.create);
router.patch('/:id', authenticate, requireRole('admin', 'service_provider'), servicesController.update);
router.delete('/:id',authenticate, requireRole('admin', 'service_provider'), servicesController.remove);

// Admin approval flow
router.post('/:id/approve', authenticate, requireRole('admin'), servicesController.approve);
router.post('/:id/reject',  authenticate, requireRole('admin'), servicesController.reject);

export default router;
