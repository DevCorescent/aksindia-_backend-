import { Router } from 'express';
import { walletsController } from './wallets.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

router.get('/me',      authenticate, walletsController.getMyWallet);
router.post('/credit', authenticate, requireRole('admin'), walletsController.credit);
router.post('/ensure', authenticate, walletsController.ensure);

export default router;
