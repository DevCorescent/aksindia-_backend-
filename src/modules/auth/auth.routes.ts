import { Router } from 'express';
import { authController } from './auth.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.post('/signin',                    authController.signIn);
router.post('/signup',                    authController.signUp);
router.post('/refresh',                   authController.refresh);
router.post('/signout',                   authController.signOut);
router.get('/me',                         authenticate, authController.me);
router.patch('/me',                       authenticate, authController.updateMe);
router.post('/change-password',           authenticate, authController.changePassword);
router.get('/sessions',                   authenticate, authController.sessions);
router.delete('/sessions/:sessionId',     authenticate, authController.revokeSession);

export default router;
