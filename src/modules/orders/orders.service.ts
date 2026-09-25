import { query, queryOne, execute } from '../../config/db';
import type { Order, UserRole } from '../../types';
import { mapOrder } from '../../utils/mappers';
import { walletsService, withTransaction } from '../wallets/wallets.service';
import { orderHistoryService } from './order-history.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A cart item points at something that is not a real product (e.g. a built-in demo item). */
export const ITEM_UNAVAILABLE = 'Some items in your cart are no longer available.';

async function creditParties(order: Order): Promise<void> {
  const storeCredit = order.total - order.commissionTotal;
  if (storeCredit > 0 && order.storeId && UUID_RE.test(order.storeId)) {
    const storeRow = await queryOne<{ owner_id: string }>('SELECT owner_id FROM stores WHERE id = $1', [order.storeId]);
    if (storeRow?.owner_id) {
      await walletsService.credit(
        storeRow.owner_id, storeCredit,
        `Order ${order.id} delivered`, order.id, 'order',
      );
      await execute(
        'UPDATE stores SET total_sales = total_sales + $1, total_orders = total_orders + 1 WHERE id = $2',
        [order.total, order.storeId],
      );
    }
  }
  if (order.agentCommission && order.agentCommission > 0 && order.agentId) {
    await walletsService.credit(
      order.agentId, order.agentCommission,
      `Commission for order ${order.id}`, order.id, 'commission',
    );
    await execute(
      'UPDATE agents SET total_earned = total_earned + $1, total_orders = total_orders + 1, total_sales = total_sales + $2 WHERE id = $3',
      [order.agentCommission, order.total, order.agentId],
    );
  }
}

export const ordersService = {
  async list(role: UserRole, userId?: string, storeId?: string): Promise<Order[]> {
    const params: unknown[] = [];
    const where: string[] = [];
    if (role === 'customer')         where.push(`customer_id = $${params.push(userId)}`);
    else if (role === 'store_owner') {
      // A store account without a linked store has no orders — never fall
      // through to the unfiltered list.
      if (!storeId) return [];
      where.push(`store_id = $${params.push(storeId)}`);
    }
    else if (role === 'agent')       where.push(`agent_id = $${params.push(userId)}`);
    // Delivery partners see the fulfilment queue — orders that are ready to ship,
    // in transit, or already delivered (their work history).
    else if (role === 'delivery_partner') where.push(`status IN ('processing','shipped','delivered')`);
    else if (role !== 'admin')       return [];
    const sql = `SELECT * FROM orders${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`;
    const rows = await query(sql, params);
    return rows.map(mapOrder);
  },

  async getById(id: string): Promise<Order> {
    const row = await queryOne('SELECT * FROM orders WHERE id = $1', [id]);
    if (!row) throw new Error('Order not found');
    return mapOrder(row);
  },

  async create(payload: Omit<Order, 'id'>): Promise<Order> {
    // Item product ids are used against the UUID products table. Refuse anything
    // else (such as the frontend's built-in demo items, "demo_p1") before a
    // single row is written, instead of failing half-way through.
    const items = (payload.items ?? []) as Array<{ productId?: string; quantity?: number }>;
    if (items.some(item => item.productId && !UUID_RE.test(String(item.productId)))) {
      throw new Error(ITEM_UNAVAILABLE);
    }

    const orderId = 'ORD' + Date.now().toString(36).toUpperCase();
    const storeId = payload.storeId && UUID_RE.test(payload.storeId) ? payload.storeId : null;
    // The order and its stock decrements commit together or not at all, so a
    // failure can never leave an order behind that the store would see.
    const order = await withTransaction(async (client) => {
      const { rows: [row] } = await client.query(
        `INSERT INTO orders
          (id, customer_id, customer_name, customer_email, store_id, store_name, items,
           subtotal, total, commission_total, admin_revenue, discount, shipping_charge, gst_amount,
           status, payment_method, payment_status, address, city,
           agent_id, agent_name, agent_code, agent_commission)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         RETURNING *`,
        [
          orderId, payload.customerId, payload.customerName, payload.customerEmail,
          storeId, payload.storeName, JSON.stringify(payload.items),
          payload.subtotal, payload.total, payload.commissionTotal, payload.adminRevenue,
          payload.discount ?? 0, payload.shippingCharge ?? 0, payload.gstAmount ?? 0,
          payload.status ?? 'pending', payload.paymentMethod ?? 'cod', payload.paymentStatus ?? 'pending',
          payload.address, payload.city,
          payload.agentId ?? null, payload.agentName ?? null,
          payload.agentCode ?? null, payload.agentCommission ?? null,
        ],
      );
      if (!row) throw new Error('Create failed');

      // Decrement stock for each product item
      for (const item of items) {
        if (item.productId && item.quantity) {
          await client.query(
            'UPDATE products SET stock = GREATEST(stock - $1, 0), sold = sold + $1 WHERE id = $2',
            [item.quantity, item.productId],
          );
        }
      }
      return mapOrder(row);
    });

    // Best-effort, as before: history never fails the order.
    await orderHistoryService.record(order.id, 'product', order.status, payload.customerId);

    return order;
  },

  async update(id: string, patch: Partial<Order>, changedBy?: string): Promise<Order> {
    const current = await this.getById(id);

    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (patch.status         !== undefined) { fields.push(`status = $${i++}`);          values.push(patch.status); }
    if (patch.paymentStatus  !== undefined) { fields.push(`payment_status = $${i++}`);  values.push(patch.paymentStatus); }
    if (patch.paymentMethod  !== undefined) { fields.push(`payment_method = $${i++}`);  values.push(patch.paymentMethod); }
    if (patch.trackingNumber !== undefined) { fields.push(`tracking_number = $${i++}`); values.push(patch.trackingNumber); }
    if (patch.courierName    !== undefined) { fields.push(`courier_name = $${i++}`);    values.push(patch.courierName); }
    if (patch.cancelReason   !== undefined) { fields.push(`cancel_reason = $${i++}`);   values.push(patch.cancelReason); }
    if (fields.length === 0) return current;
    values.push(id);
    const row = await queryOne(
      `UPDATE orders SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values,
    );
    if (!row) throw new Error('Order not found');
    const updated = mapOrder(row);
    if (updated.status !== current.status) {
      await orderHistoryService.record(id, 'product', updated.status, changedBy, updated.status === 'cancelled' ? updated.cancelReason : undefined);
    }

    // Credit store wallet when order is delivered and paid
    const wasDelivered = current.status !== 'delivered' && updated.status === 'delivered';
    const isPaid = updated.paymentStatus === 'paid';
    if (wasDelivered && isPaid) {
      await creditParties(updated);
    }

    return updated;
  },

  async cancel(id: string, reason: string, changedBy?: string): Promise<Order> {
    const row = await queryOne(
      `UPDATE orders SET status = 'cancelled', cancel_reason = $1 WHERE id = $2 AND status NOT IN ('delivered','cancelled') RETURNING *`,
      [reason, id],
    );
    if (!row) throw new Error('Order not found or cannot be cancelled');
    await orderHistoryService.record(id, 'product', 'cancelled', changedBy, reason);
    return mapOrder(row);
  },
};
