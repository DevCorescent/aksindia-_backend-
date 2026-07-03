import { Router } from 'express';
import { withdrawalsController } from './withdrawals.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

router.get('/',      authenticate, withdrawalsController.list);
router.post('/',     authenticate, withdrawalsController.create);
router.patch('/:id', authenticate, requireRole('admin'), withdrawalsController.update);

export default router;
