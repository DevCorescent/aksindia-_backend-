import { query, queryOne, execute } from '../../config/db';
import type { OrderStatusEvent } from '../../types';

type OrderType = 'product' | 'service';

function toISO(val: unknown): string {
  return val instanceof Date ? val.toISOString() : String(val ?? '');
}

export const orderHistoryService = {
  /**
   * Append a status change. History is informational — a failure here must
   * never fail the order update that triggered it, so errors are logged only.
   */
  async record(orderId: string, orderType: OrderType, status: string, changedBy?: string, note?: string): Promise<void> {
    try {
      await execute(
        `INSERT INTO order_status_history (order_id, order_type, status, changed_by, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, orderType, status, changedBy ?? null, note ?? null],
      );
    } catch (e) {
      console.error(`[order-history] could not record ${orderType} ${orderId} → ${status}:`, (e as Error).message);
    }
  },

  /**
   * Status timeline for an order, oldest first. Orders placed before history
   * was recorded have no 'pending' row, so the placement is synthesised from
   * the order's own created_at.
   */
  async timeline(orderId: string, orderType: OrderType): Promise<OrderStatusEvent[]> {
    const table = orderType === 'product' ? 'orders' : 'service_orders';
    const [rows, order] = await Promise.all([
      query<{ status: string; note: string | null; created_at: Date }>(
        `SELECT status, note, created_at FROM order_status_history
         WHERE order_id = $1 AND order_type = $2 ORDER BY created_at ASC`,
        [orderId, orderType],
      ),
      queryOne<{ status: string; created_at: Date; updated_at: Date }>(
        `SELECT status, created_at, updated_at FROM ${table} WHERE id = $1`,
        [orderId],
      ),
    ]);

    const events: OrderStatusEvent[] = rows.map(r => ({
      status: r.status,
      at:     toISO(r.created_at),
      ...(r.note ? { note: r.note } : {}),
    }));
    if (!order) return events;

    if (events[0]?.status !== 'pending') {
      events.unshift({ status: 'pending', at: toISO(order.created_at) });
    }
    // Legacy orders (or ones changed outside the API) may already be past the
    // last recorded step — surface the current status with its last update.
    if (events[events.length - 1].status !== order.status) {
      events.push({ status: order.status, at: toISO(order.updated_at) });
    }
    return events;
  },
};
