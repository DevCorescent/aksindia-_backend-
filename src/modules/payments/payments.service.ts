import { createHmac } from 'crypto';
import { queryOne, execute } from '../../config/db';
import { env } from '../../config/env';
import { ordersService } from '../orders/orders.service';
import { serviceOrdersService } from '../service-orders/service-orders.service';
import { mapOrder } from '../../utils/mappers';
import { walletsService } from '../wallets/wallets.service';
import { logger } from '../../utils/logger';

const TAG = 'Payments';

// ── Cashfree ─────────────────────────────────────────────────────────────────

interface CashfreeOrderParams {
  orderId: string;
  amount: number;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  returnUrl: string;
}

interface CashfreeWebhookEvent {
  type: string;
  data: {
    order: { order_id: string; order_status: string; order_amount: number };
    payment?: { cf_payment_id: number | string; payment_status: string };
    customer_details?: { customer_id: string; customer_name?: string; customer_email?: string };
  };
  event_time: string;
}

export const cashfreeService = {
  async getOrderStatus(orderId: string): Promise<{ orderStatus: string; orderAmount: number }> {
    const baseUrl = env.cashfreeEnv === 'production'
      ? 'https://api.cashfree.com'
      : 'https://sandbox.cashfree.com';

    logger.info(TAG, 'getOrderStatus: calling Cashfree', { orderId, env: env.cashfreeEnv, baseUrl });

    const res = await fetch(`${baseUrl}/pg/orders/${encodeURIComponent(orderId)}`, {
      headers: {
        'x-client-id':     env.cashfreeAppId,
        'x-client-secret': env.cashfreeSecretKey,
        'x-api-version':   '2023-08-01',
      },
    });

    logger.info(TAG, 'getOrderStatus: Cashfree responded', { orderId, httpStatus: res.status });

    if (!res.ok) {
      const txt = await res.text();
      logger.error(TAG, 'getOrderStatus: Cashfree error', { orderId, httpStatus: res.status, body: txt });
      throw new Error(`Cashfree get order failed (${res.status}): ${txt}`);
    }
    const data = await res.json() as { order_status: string; order_amount: number };
    logger.info(TAG, 'getOrderStatus: result', { orderId, orderStatus: data.order_status, orderAmount: data.order_amount });
    return { orderStatus: data.order_status, orderAmount: data.order_amount };
  },

  async createOrder(params: CashfreeOrderParams): Promise<{ paymentSessionId: string; cfOrderId: string }> {
    const baseUrl = env.cashfreeEnv === 'production'
      ? 'https://api.cashfree.com'
      : 'https://sandbox.cashfree.com';

    logger.info(TAG, 'createOrder: calling Cashfree', {
      orderId: params.orderId,
      amount: params.amount,
      customerId: params.customerId,
      returnUrl: params.returnUrl,
      env: env.cashfreeEnv,
    });

    const res = await fetch(`${baseUrl}/pg/orders`, {
      method: 'POST',
      headers: {
        'x-client-id':     env.cashfreeAppId,
        'x-client-secret': env.cashfreeSecretKey,
        'x-api-version':   '2023-08-01',
        'Content-Type':    'application/json',
      },
      body: JSON.stringify({
        order_id:      params.orderId,
        order_amount:  params.amount,
        order_currency: 'INR',
        customer_details: {
          customer_id:    params.customerId.slice(0, 50),
          customer_name:  params.customerName || 'Customer',
          customer_email: params.customerEmail || 'noreply@askindia.in',
          customer_phone: (params.customerPhone || '9999999999').replace(/\D/g, '').slice(-10),
        },
        order_meta: {
          return_url: params.returnUrl,
        },
      }),
    });

    logger.info(TAG, 'createOrder: Cashfree responded', { orderId: params.orderId, httpStatus: res.status });

    if (!res.ok) {
      const errText = await res.text();
      logger.error(TAG, 'createOrder: Cashfree error', { orderId: params.orderId, httpStatus: res.status, body: errText });
      throw new Error(`Cashfree order creation failed (${res.status}): ${errText}`);
    }

    const data = await res.json() as { cf_order_id: string; payment_session_id: string };
    logger.info(TAG, 'createOrder: SUCCESS', { orderId: params.orderId, cfOrderId: data.cf_order_id, hasSessionId: !!data.payment_session_id });
    return { paymentSessionId: data.payment_session_id, cfOrderId: data.cf_order_id };
  },

  verifyWebhook(rawBody: Buffer, timestamp: string, signature: string): boolean {
    if (!env.cashfreeWebhookSecret) {
      logger.warn(TAG, 'verifyWebhook: CASHFREE_WEBHOOK_SECRET not set — skipping verification');
      return true;
    }
    const payload = timestamp + '\n' + rawBody.toString();
    const expected = createHmac('sha256', env.cashfreeWebhookSecret)
      .update(payload)
      .digest('base64');
    const valid = expected === signature;
    if (!valid) {
      logger.error(TAG, 'verifyWebhook: SIGNATURE MISMATCH', { timestamp, signatureReceived: signature, signatureExpected: expected });
    } else {
      logger.debug(TAG, 'verifyWebhook: signature OK');
    }
    return valid;
  },

  async handleWebhook(event: CashfreeWebhookEvent): Promise<{ processed: boolean; message: string }> {
    const { type, data } = event;
    const orderId      = data.order?.order_id;
    const orderAmount  = data.order?.order_amount;
    const orderStatus  = data.order?.order_status;
    const customerId   = data.customer_details?.customer_id;
    const paymentId    = data.payment?.cf_payment_id;
    const paymentStatus = data.payment?.payment_status;

    logger.info(TAG, 'handleWebhook: received', { type, orderId, orderAmount, orderStatus, customerId, paymentId, paymentStatus });

    if (!orderId) {
      logger.error(TAG, 'handleWebhook: missing order_id in payload — rejecting');
      return { processed: false, message: 'No order_id in webhook payload' };
    }

    // ── Wallet recharge ──────────────────────────────────────────────────────
    if (type === 'PAYMENT_SUCCESS_WEBHOOK' && orderId.startsWith('WLTRCG')) {
      logger.info(TAG, 'handleWebhook: wallet recharge path', { orderId, customerId, orderAmount });

      if (!customerId) {
        logger.error(TAG, 'handleWebhook: wallet recharge missing customer_id', { orderId });
        return { processed: false, message: 'No customer_id in wallet recharge webhook' };
      }

      // Idempotency: skip if this orderId was already credited
      logger.debug(TAG, 'handleWebhook: checking idempotency', { orderId });
      const existing = await queryOne(
        "SELECT id FROM wallet_transactions WHERE reference_id = $1 AND reference_type = 'recharge'",
        [orderId],
      );
      if (existing) {
        logger.warn(TAG, 'handleWebhook: duplicate webhook — already credited, skipping', { orderId });
        return { processed: true, message: `Already credited for ${orderId}` };
      }
      logger.debug(TAG, 'handleWebhook: idempotency OK — no prior credit found', { orderId });

      try {
        logger.info(TAG, 'handleWebhook: ensuring wallet exists', { userId: customerId });
        await walletsService.ensureWallet(customerId);

        logger.info(TAG, 'handleWebhook: crediting wallet', { userId: customerId, amount: orderAmount });
        await walletsService.credit(customerId, orderAmount, 'Wallet top-up via Cashfree', orderId, 'recharge');

        logger.info(TAG, 'handleWebhook: wallet credit SUCCESS', { userId: customerId, amount: orderAmount, orderId });
        return { processed: true, message: `Wallet credited ₹${orderAmount} for user ${customerId}` };
      } catch (err) {
        logger.error(TAG, 'handleWebhook: wallet credit FAILED', {
          userId: customerId,
          amount: orderAmount,
          orderId,
          error: (err as Error).message,
          stack: (err as Error).stack,
        });
        throw err;
      }
    }

    // ── Order payment success ─────────────────────────────────────────────────
    if (type === 'PAYMENT_SUCCESS_WEBHOOK') {
      logger.info(TAG, 'handleWebhook: order payment success', { orderId });
      await execute(
        "UPDATE orders SET payment_status = 'paid', payment_method = 'cashfree' WHERE id = $1 AND payment_status != 'paid'",
        [orderId],
      );
      const row = await queryOne('SELECT status FROM orders WHERE id = $1', [orderId]);
      if (row && (row as Record<string, unknown>).status === 'delivered') {
        logger.info(TAG, 'handleWebhook: order already delivered — triggering wallet credit', { orderId });
        await ordersService.update(orderId, { paymentStatus: 'paid' });
      }
      logger.info(TAG, 'handleWebhook: order marked paid', { orderId });
      return { processed: true, message: `Order ${orderId} marked paid via Cashfree` };
    }

    // ── Payment failure ───────────────────────────────────────────────────────
    if (type === 'PAYMENT_FAILED_WEBHOOK' || type === 'PAYMENT_USER_DROPPED_WEBHOOK') {
      logger.warn(TAG, 'handleWebhook: payment failed/dropped', { orderId, type });
      await execute(
        "UPDATE orders SET payment_status = 'failed' WHERE id = $1 AND payment_status = 'pending'",
        [orderId],
      );
      return { processed: true, message: `Order ${orderId} payment failure recorded` };
    }

    logger.warn(TAG, 'handleWebhook: unhandled event type', { type, orderId });
    return { processed: false, message: `Event type ${type} not handled` };
  },
};

export function verifyRazorpaySignature(rawBody: Buffer, signature: string): boolean {
  if (!env.razorpayWebhookSecret) return true; // skip in dev if secret not set
  const expected = createHmac('sha256', env.razorpayWebhookSecret)
    .update(rawBody)
    .digest('hex');
  return expected === signature;
}

interface RazorpayPaymentEvent {
  event: string;
  payload: {
    payment?: {
      entity: {
        id: string;
        order_id: string;
        amount: number;
        status: string;
        notes?: Record<string, string>;
      };
    };
    order?: {
      entity: {
        id: string;
        receipt?: string;
        notes?: Record<string, string>;
      };
    };
  };
}

export const paymentsService = {
  async handleWebhook(event: RazorpayPaymentEvent): Promise<{ processed: boolean; message: string }> {
    const { event: eventType, payload } = event;

    if (eventType === 'payment.captured') {
      const payment = payload.payment?.entity;
      if (!payment) return { processed: false, message: 'No payment entity' };

      const notes = payment.notes ?? {};
      const orderId     = notes['order_id'];
      const svcOrderId  = notes['service_order_id'];

      if (orderId) {
        const row = await queryOne('SELECT * FROM orders WHERE id = $1', [orderId]);
        if (!row) return { processed: false, message: `Order ${orderId} not found` };
        const order = mapOrder(row);

        if (order.paymentStatus !== 'paid') {
          await execute(
            "UPDATE orders SET payment_status = 'paid', payment_method = 'razorpay' WHERE id = $1",
            [orderId],
          );
          // If already delivered, credit wallets now
          if (order.status === 'delivered') {
            await ordersService.update(orderId, { paymentStatus: 'paid' });
          }
        }
        return { processed: true, message: `Order ${orderId} marked paid` };
      }

      if (svcOrderId) {
        await execute(
          "UPDATE service_orders SET status = 'confirmed' WHERE id = $1 AND status = 'pending'",
          [svcOrderId],
        );
        return { processed: true, message: `Service order ${svcOrderId} confirmed` };
      }

      return { processed: false, message: 'No recognizable order reference in payment notes' };
    }

    if (eventType === 'payment.failed') {
      const notes = payload.payment?.entity?.notes ?? {};
      const orderId = notes['order_id'];
      if (orderId) {
        await execute(
          "UPDATE orders SET payment_status = 'failed' WHERE id = $1",
          [orderId],
        );
      }
      return { processed: true, message: 'Payment failure recorded' };
    }

    return { processed: false, message: `Event ${eventType} not handled` };
  },

  async createOrderIntent(orderId: string): Promise<{ orderId: string; amount: number; currency: string; notes: Record<string, string> }> {
    const row = await queryOne('SELECT id, total, customer_name FROM orders WHERE id = $1', [orderId]);
    if (!row) throw new Error('Order not found');
    const r = row as Record<string, unknown>;
    return {
      orderId,
      amount:   Math.round(Number(r.total) * 100), // Razorpay uses paise
      currency: 'INR',
      notes:    { order_id: orderId },
    };
  },
};
