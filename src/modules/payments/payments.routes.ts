import { Router } from 'express';
import { paymentsController } from './payments.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

// Razorpay — raw body applied in app.ts
router.post('/webhook',              paymentsController.webhook);
router.get('/intent/:orderId',       authenticate, paymentsController.getOrderIntent);

// Cashfree — raw body for webhook applied in app.ts
router.post('/cashfree/order',       authenticate, paymentsController.cashfreeCreateOrder);
router.post('/cashfree/webhook',     paymentsController.cashfreeWebhook);

export default router;
