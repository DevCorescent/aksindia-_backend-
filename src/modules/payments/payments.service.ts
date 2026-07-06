import { createHmac } from 'crypto';
import { queryOne, execute } from '../../config/db';
import { env } from '../../config/env';
import { ordersService } from '../orders/orders.service';
import { serviceOrdersService } from '../service-orders/service-orders.service';
import { mapOrder } from '../../utils/mappers';

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
  };
  event_time: string;
}

export const cashfreeService = {
  async createOrder(params: CashfreeOrderParams): Promise<{ paymentSessionId: string; cfOrderId: string }> {
    const baseUrl = env.cashfreeEnv === 'production'
      ? 'https://api.cashfree.com'
      : 'https://sandbox.cashfree.com';

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

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Cashfree order creation failed (${res.status}): ${errText}`);
    }

    const data = await res.json() as { cf_order_id: string; payment_session_id: string };
    return { paymentSessionId: data.payment_session_id, cfOrderId: data.cf_order_id };
  },

  verifyWebhook(rawBody: Buffer, timestamp: string, signature: string): boolean {
    if (!env.cashfreeWebhookSecret) return true;
    const payload = timestamp + '\n' + rawBody.toString();
    const expected = createHmac('sha256', env.cashfreeWebhookSecret)
      .update(payload)
      .digest('base64');
    return expected === signature;
  },

  async handleWebhook(event: CashfreeWebhookEvent): Promise<{ processed: boolean; message: string }> {
    const { type, data } = event;
    const orderId = data.order?.order_id;

    if (!orderId) return { processed: false, message: 'No order_id in webhook payload' };

    if (type === 'PAYMENT_SUCCESS_WEBHOOK') {
      await execute(
        "UPDATE orders SET payment_status = 'paid', payment_method = 'cashfree' WHERE id = $1 AND payment_status != 'paid'",
        [orderId],
      );
      const row = await queryOne('SELECT status FROM orders WHERE id = $1', [orderId]);
      if (row && (row as Record<string, unknown>).status === 'delivered') {
        await ordersService.update(orderId, { paymentStatus: 'paid' });
      }
      return { processed: true, message: `Order ${orderId} marked paid via Cashfree` };
    }

    if (type === 'PAYMENT_FAILED_WEBHOOK' || type === 'PAYMENT_USER_DROPPED_WEBHOOK') {
      await execute(
        "UPDATE orders SET payment_status = 'failed' WHERE id = $1 AND payment_status = 'pending'",
        [orderId],
      );
      return { processed: true, message: `Order ${orderId} payment failure recorded` };
    }

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
