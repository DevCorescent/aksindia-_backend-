import { Router } from 'express';
import { authController } from './auth.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.post('/signin',   authController.signIn);
router.post('/signup',   authController.signUp);
router.get('/me',        authenticate, authController.me);
router.patch('/me',      authenticate, authController.updateMe);

export default router;
