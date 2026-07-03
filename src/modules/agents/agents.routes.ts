import { Router } from 'express';
import { agentsController } from './agents.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

router.get('/',           authenticate, requireRole('admin'), agentsController.list);
router.get('/code/:code', authenticate, agentsController.getByCode);
router.get('/:id',        authenticate, agentsController.getById);
router.post('/',          authenticate, requireRole('admin'), agentsController.create);
router.patch('/:id',      authenticate, requireRole('admin'), agentsController.update);

export default router;
