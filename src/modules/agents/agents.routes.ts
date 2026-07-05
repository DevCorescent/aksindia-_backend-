import { Router } from 'express';
import { agentsController } from './agents.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

router.get('/',                authenticate, requireRole('admin'), agentsController.list);
router.get('/code/:code',      authenticate, agentsController.getByCode);
router.get('/:id',             authenticate, agentsController.getById);
router.get('/:id/earnings',    authenticate, agentsController.earnings);
router.post('/',               authenticate, requireRole('admin'), agentsController.create);
router.post('/:id/approve',    authenticate, requireRole('admin'), agentsController.approve);
router.post('/:id/reject',     authenticate, requireRole('admin'), agentsController.reject);
router.patch('/:id',           authenticate, requireRole('admin'), agentsController.update);

export default router;
