import { Router } from 'express';
import { homepageController } from './homepage.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

router.get('/',   homepageController.get);
router.patch('/', authenticate, requireRole('admin'), homepageController.update);

export default router;
