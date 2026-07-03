import { Router } from 'express';
import { storesController } from './stores.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

router.get('/',            authenticate, storesController.list);
router.get('/slug/:slug',  authenticate, storesController.getBySlug);
router.get('/:id',         authenticate, storesController.getById);
router.post('/',           authenticate, requireRole('admin', 'store_owner'), storesController.create);
router.patch('/:id',       authenticate, requireRole('admin', 'store_owner'), storesController.update);

export default router;
