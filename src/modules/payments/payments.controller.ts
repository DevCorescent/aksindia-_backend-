import type { Request, Response } from 'express';
import { paymentsService, verifyRazorpaySignature, cashfreeService } from './payments.service';
import { ok, badRequest, serverError } from '../../utils/response';
import { queryOne } from '../../config/db';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

const TAG = 'PaymentsCtrl';

export const paymentsController = {
  async webhook(req: Request, res: Response): Promise<void> {
    try {
      const signature = req.headers['x-razorpay-signature'] as string;
      const rawBody = req.body as Buffer;
      logger.info(TAG, 'Razorpay webhook received', { hasSignature: !!signature });

      if (signature && !verifyRazorpaySignature(rawBody, signature)) {
        logger.error(TAG, 'Razorpay webhook: invalid signature');
        badRequest(res, 'Invalid webhook signature');
        return;
      }

      const event = JSON.parse(rawBody.toString());
      logger.info(TAG, 'Razorpay webhook: processing', { eventType: event?.event });
      const result = await paymentsService.handleWebhook(event);
      logger.info(TAG, 'Razorpay webhook: done', { result });
      ok(res, result);
    } catch (e) {
      logger.error(TAG, 'Razorpay webhook: exception', { error: (e as Error).message });
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

      logger.info(TAG, 'cashfreeCreateOrder: lookup order', { orderId });
      const row = await queryOne(
        'SELECT id, total, customer_name, customer_email, customer_id FROM orders WHERE id = $1',
        [orderId],
      );
      if (!row) { badRequest(res, 'Order not found'); return; }
      const r = row as Record<string, unknown>;

      const returnUrl = `${env.frontendUrl}/shop/checkout/payment-return?order_id={order_id}`;
      logger.info(TAG, 'cashfreeCreateOrder: creating Cashfree order', { orderId, total: r.total, returnUrl });

      const result = await cashfreeService.createOrder({
        orderId,
        amount:        Math.round(Number(r.total) * 100) / 100,
        customerId:    String(r.customer_id ?? req.user!.id),
        customerName:  String(r.customer_name ?? ''),
        customerEmail: String(r.customer_email ?? req.user!.email),
        customerPhone: String(req.user!.phone ?? ''),
        returnUrl,
      });

      logger.info(TAG, 'cashfreeCreateOrder: success', { orderId, cfOrderId: result.cfOrderId });
      ok(res, result);
    } catch (e) {
      logger.error(TAG, 'cashfreeCreateOrder: failed', { error: (e as Error).message });
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

      logger.info(TAG, 'cashfreeWalletRecharge: creating order', { userId, orderId, amount, returnUrl });

      const result = await cashfreeService.createOrder({
        orderId,
        amount:        Math.round(amount * 100) / 100,
        customerId:    userId,
        customerName:  req.user!.name ?? 'User',
        customerEmail: req.user!.email ?? 'noreply@askindia.in',
        customerPhone: req.user!.phone ?? '',
        returnUrl,
      });

      logger.info(TAG, 'cashfreeWalletRecharge: Cashfree order created', { orderId, cfOrderId: result.cfOrderId, hasSessionId: !!result.paymentSessionId });
      ok(res, result);
    } catch (e) {
      logger.error(TAG, 'cashfreeWalletRecharge: failed', { error: (e as Error).message, stack: (e as Error).stack });
      serverError(res, (e as Error).message);
    }
  },

  async cashfreeGetOrderStatus(req: Request, res: Response): Promise<void> {
    try {
      const { orderId } = req.params;
      if (!orderId) { badRequest(res, 'orderId is required'); return; }
      logger.info(TAG, 'cashfreeGetOrderStatus: checking', { orderId });
      const result = await cashfreeService.getOrderStatus(orderId);
      logger.info(TAG, 'cashfreeGetOrderStatus: result', { orderId, ...result });
      ok(res, result);
    } catch (e) {
      logger.error(TAG, 'cashfreeGetOrderStatus: failed', { orderId: req.params.orderId, error: (e as Error).message });
      serverError(res, (e as Error).message);
    }
  },

  async cashfreeWebhook(req: Request, res: Response): Promise<void> {
    try {
      const rawBody   = req.body as Buffer;
      const timestamp = req.headers['x-webhook-timestamp'] as string;
      const signature = req.headers['x-webhook-signature'] as string;
      const version   = req.headers['x-webhook-version'] as string;
      const attempt   = req.headers['x-webhook-attempt'] as string;

      logger.info(TAG, 'cashfreeWebhook: received', {
        hasTimestamp: !!timestamp,
        hasSignature: !!signature,
        version,
        attempt,
        bodyLength: rawBody?.length,
      });

      // Log raw body (first 800 chars so we see the full payload without flooding logs)
      const rawStr = rawBody?.toString() ?? '';
      logger.debug(TAG, 'cashfreeWebhook: raw body', { body: rawStr.slice(0, 800) });

      if (timestamp && signature && !cashfreeService.verifyWebhook(rawBody, timestamp, signature)) {
        logger.error(TAG, 'cashfreeWebhook: SIGNATURE INVALID — rejecting');
        badRequest(res, 'Invalid webhook signature');
        return;
      }

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(rawStr);
      } catch (parseErr) {
        logger.error(TAG, 'cashfreeWebhook: failed to parse JSON body', { error: (parseErr as Error).message, raw: rawStr.slice(0, 200) });
        badRequest(res, 'Invalid JSON body');
        return;
      }

      logger.info(TAG, 'cashfreeWebhook: parsed', {
        type: event?.type,
        orderId: (event?.data as Record<string, unknown>)?.['order']?.['order_id'],
      });

      const result = await cashfreeService.handleWebhook(event as Parameters<typeof cashfreeService.handleWebhook>[0]);
      logger.info(TAG, 'cashfreeWebhook: handled', { result });
      ok(res, result);
    } catch (e) {
      logger.error(TAG, 'cashfreeWebhook: EXCEPTION', { error: (e as Error).message, stack: (e as Error).stack });
      serverError(res, (e as Error).message);
    }
  },
};
