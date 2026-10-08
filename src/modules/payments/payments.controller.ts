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

  async cashfreeWalletRecharge(req: Request, res: Response): Promise<void> {
    try {
      const { amount } = req.body as { amount: number };
      if (!amount || amount < 10) { badRequest(res, 'Minimum recharge amount is ₹10'); return; }

      const userId  = req.user!.id;
      const orderId = `WLTRCG${Date.now()}`;
      // {order_id} is the only Cashfree-supported template variable in return_url
      const returnUrl = `${env.frontendUrl}/wallet/recharge-return?order_id={order_id}`;

      console.log('[Wallet Recharge] Creating Cashfree order. userId:', userId, 'orderId:', orderId, 'amount:', amount);

      const result = await cashfreeService.createOrder({
        orderId,
        amount:        Math.round(amount * 100) / 100,
        customerId:    userId,
        customerName:  req.user!.name ?? 'User',
        customerEmail: req.user!.email ?? 'noreply@askindia.in',
        customerPhone: req.user!.phone ?? '',
        returnUrl,
      });

      console.log('[Wallet Recharge] Cashfree order created. cfOrderId:', result.cfOrderId, 'hasSessionId:', !!result.paymentSessionId);
      ok(res, result);
    } catch (e) {
      console.error('[Wallet Recharge] Failed:', (e as Error).message);
      serverError(res, (e as Error).message);
    }
  },

  async cashfreeGetOrderStatus(req: Request, res: Response): Promise<void> {
    try {
      const { orderId } = req.params;
      if (!orderId) { badRequest(res, 'orderId is required'); return; }
      const result = await cashfreeService.getOrderStatus(orderId);
      ok(res, result);
    } catch (e) {
      serverError(res, (e as Error).message);
    }
  },

  async cashfreeWebhook(req: Request, res: Response): Promise<void> {
    try {
      const rawBody   = req.body as Buffer;
      const timestamp = req.headers['x-webhook-timestamp'] as string;
      const signature = req.headers['x-webhook-signature'] as string;

      console.log('[Cashfree Webhook] Received. timestamp:', timestamp, 'signature:', signature ? '***' : 'MISSING');
      console.log('[Cashfree Webhook] Raw body:', rawBody.toString().slice(0, 500));

      if (timestamp && signature && !cashfreeService.verifyWebhook(rawBody, timestamp, signature)) {
        console.log('[Cashfree Webhook] ERROR: Signature verification failed');
        badRequest(res, 'Invalid webhook signature');
        return;
      }

      const event = JSON.parse(rawBody.toString());
      console.log('[Cashfree Webhook] Parsed event type:', event?.type, 'order_id:', event?.data?.order?.order_id);

      const result = await cashfreeService.handleWebhook(event);
      console.log('[Cashfree Webhook] Result:', result);
      ok(res, result);
    } catch (e) {
      console.error('[Cashfree Webhook] Exception:', (e as Error).message);
      serverError(res, (e as Error).message);
    }
  },
};
