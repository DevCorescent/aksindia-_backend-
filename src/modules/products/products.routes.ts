import { Router } from 'express';
import { productsController } from './products.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

// Public – no auth required
router.get('/public',          productsController.listPublic);
router.get('/public/featured', productsController.featured);
router.get('/public/search',   productsController.search);

// Authenticated
router.get('/',      authenticate, productsController.list);
router.get('/:id',   authenticate, productsController.getById);
router.post('/',     authenticate, requireRole('admin', 'store_owner'), productsController.create);
router.patch('/:id', authenticate, requireRole('admin', 'store_owner'), productsController.update);
router.delete('/:id',authenticate, requireRole('admin', 'store_owner'), productsController.remove);

export default router;
