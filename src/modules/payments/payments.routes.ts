import { Router } from 'express';
import { paymentsController } from './payments.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

// Raw body middleware is applied in app.ts specifically for this route
router.post('/webhook',              paymentsController.webhook);
router.get('/intent/:orderId',       authenticate, paymentsController.getOrderIntent);

export default router;
