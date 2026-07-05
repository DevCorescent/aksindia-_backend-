import { Router } from 'express';
import { storesController } from './stores.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

// Public – no auth
router.get('/public',          storesController.listPublic);
router.get('/public/slug/:slug', storesController.getBySlug);
router.get('/public/:id',      storesController.getById);
router.get('/public/:id/products', storesController.getProducts);

// Authenticated
router.get('/',            authenticate, storesController.list);
router.get('/slug/:slug',  authenticate, storesController.getBySlug);
router.get('/:id',         authenticate, storesController.getById);
router.get('/:id/products',authenticate, storesController.getProducts);
router.post('/',           authenticate, requireRole('admin', 'store_owner'), storesController.create);
router.patch('/:id',       authenticate, requireRole('admin', 'store_owner'), storesController.update);

// Admin only — approval flow
router.post('/:id/activate', authenticate, requireRole('admin'), storesController.activate);
router.post('/:id/reject',   authenticate, requireRole('admin'), storesController.reject);

export default router;
