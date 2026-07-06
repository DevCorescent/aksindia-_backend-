import { Router } from 'express';
import { paymentsController } from './payments.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Payments
 *     description: Razorpay payment intents and gateway webhooks
 */

// Raw body middleware is applied in app.ts specifically for this route
/**
 * @openapi
 * /payments/webhook:
 *   post:
 *     tags: [Payments]
 *     summary: Razorpay payment gateway webhook (called by Razorpay, not the frontend)
 *     description: >
 *       Receives raw JSON events from Razorpay. The request body is read as a raw Buffer
 *       and its signature is verified against the `x-razorpay-signature` header before the
 *       event is processed. This endpoint is public (no bearer token) and is invoked
 *       server-to-server by the payment gateway.
 *     security: []
 *     parameters:
 *       - in: header
 *         name: x-razorpay-signature
 *         required: false
 *         schema: { type: string }
 *         description: HMAC signature of the raw body, verified against the webhook secret
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Raw Razorpay event payload
 *     responses:
 *       200: { description: Event processed }
 *       400: { description: Invalid webhook signature }
 *       500: { description: Processing error }
 */
router.post('/webhook',              paymentsController.webhook);

/**
 * @openapi
 * /payments/intent/{orderId}:
 *   get:
 *     tags: [Payments]
 *     summary: Create/fetch a payment intent for an order
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *         description: Order id to create the payment intent for
 *     responses:
 *       200: { description: Payment intent details }
 *       401: { description: Missing/invalid token }
 *       500: { description: Failed to create intent }
 */
router.get('/intent/:orderId',       authenticate, paymentsController.getOrderIntent);

export default router;
