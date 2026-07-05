import { createHmac } from 'crypto';
import { queryOne, execute } from '../../config/db';
import { env } from '../../config/env';
import { ordersService } from '../orders/orders.service';
import { serviceOrdersService } from '../service-orders/service-orders.service';
import { mapOrder } from '../../utils/mappers';

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
