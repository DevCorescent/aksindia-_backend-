import type { Request, Response } from 'express';
import { paymentsService, verifyRazorpaySignature, cashfreeService } from './payments.service';
import { ok, badRequest, serverError } from '../../utils/response';
import { queryOne } from '../../config/db';
import { env } from '../../config/env';

export const paymentsController = {
  async webhook(req: Request, res: Response): Promise<void> {
    try {
      const signature = req.headers['x-razorpay-signature'] as string;
      const rawBody = req.body as Buffer;

      if (signature && !verifyRazorpaySignature(rawBody, signature)) {
        badRequest(res, 'Invalid webhook signature');
        return;
      }

      const event = JSON.parse(rawBody.toString());
      const result = await paymentsService.handleWebhook(event);
      ok(res, result);
    } catch (e) {
      serverError(res, (e as Error).message);
    }
  },

  async getOrderIntent(req: Request, res: Response): Promise<void> {
    try {
      const intent = await paymentsService.createOrderIntent(req.params.orderId);
      ok(res, intent);
    } catch (e) {
      serverError(res, (e as Error).message);
    }
  },

  async cashfreeCreateOrder(req: Request, res: Response): Promise<void> {
    try {
      const { orderId } = req.body as { orderId: string };
      if (!orderId) { badRequest(res, 'orderId is required'); return; }

      const row = await queryOne(
        'SELECT id, total, customer_name, customer_email, customer_id FROM orders WHERE id = $1',
        [orderId],
      );
      if (!row) { badRequest(res, 'Order not found'); return; }
      const r = row as Record<string, unknown>;

      const returnUrl = `${env.frontendUrl}/shop/checkout/payment-return?order_id={order_id}`;

      const result = await cashfreeService.createOrder({
        orderId,
        amount:        Math.round(Number(r.total) * 100) / 100,
        customerId:    String(r.customer_id ?? req.user!.id),
        customerName:  String(r.customer_name ?? ''),
        customerEmail: String(r.customer_email ?? req.user!.email),
        customerPhone: String(req.user!.phone ?? ''),
        returnUrl,
      });

      ok(res, result);
    } catch (e) {
      serverError(res, (e as Error).message);
    }
  },

  async cashfreeWebhook(req: Request, res: Response): Promise<void> {
    try {
      const rawBody  = req.body as Buffer;
      const timestamp = req.headers['x-webhook-timestamp'] as string;
      const signature = req.headers['x-webhook-signature'] as string;

      if (timestamp && signature && !cashfreeService.verifyWebhook(rawBody, timestamp, signature)) {
        badRequest(res, 'Invalid webhook signature');
        return;
      }

      const event = JSON.parse(rawBody.toString());
      const result = await cashfreeService.handleWebhook(event);
      ok(res, result);
    } catch (e) {
      serverError(res, (e as Error).message);
    }
  },
};
