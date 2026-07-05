import { query, execute } from '../../config/db';
import { mapUserActivity, mapAbandonedCart } from '../../utils/mappers';
import type { UserActivity, AbandonedCart } from '../../types';

export const analyticsService = {
  async getActivities(): Promise<UserActivity[]> {
    const rows = await query('SELECT * FROM user_activities ORDER BY created_at DESC LIMIT 500');
    return rows.map(mapUserActivity);
  },

  async getAbandonedCarts(): Promise<AbandonedCart[]> {
    const rows = await query('SELECT * FROM abandoned_carts ORDER BY last_activity DESC');
    return rows.map(mapAbandonedCart);
  },

  async trackActivity(payload: Omit<UserActivity, 'id' | 'createdAt'>): Promise<void> {
    await execute(
      `INSERT INTO user_activities (user_id, user_name, user_email, user_role, event, page, metadata, session_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        payload.userId, payload.userName, payload.userEmail, payload.userRole,
        payload.event, payload.page ?? null,
        JSON.stringify(payload.metadata ?? {}), payload.sessionId ?? null,
      ],
    );
  },

  async getRevenueTrend(days = 30): Promise<{ date: string; revenue: number; orders: number }[]> {
    const rows = await query<{ date: string; revenue: string; orders: string }>(
      `SELECT
         DATE(created_at)::text AS date,
         COALESCE(SUM(total), 0)::numeric AS revenue,
         COUNT(*)::int AS orders
       FROM orders
       WHERE payment_status = 'paid'
         AND created_at >= NOW() - ($1 || ' days')::INTERVAL
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [String(days)],
    );
    return rows.map(r => ({ date: r.date, revenue: Number(r.revenue), orders: Number(r.orders) }));
  },

  async getTopProducts(limit = 10): Promise<{ productId: string; name: string; totalSold: number; revenue: number }[]> {
    const rows = await query<{ product_id: string; name: string; total_sold: string; revenue: string }>(
      `SELECT
         p.id AS product_id,
         p.name,
         p.sold AS total_sold,
         (p.price * p.sold)::numeric AS revenue
       FROM products p
       WHERE p.status = 'active'
       ORDER BY p.sold DESC
       LIMIT $1`,
      [String(limit)],
    );
    return rows.map(r => ({
      productId: r.product_id,
      name:      r.name,
      totalSold: Number(r.total_sold),
      revenue:   Number(r.revenue),
    }));
  },

  async getEventSummary(): Promise<{ event: string; count: number }[]> {
    const rows = await query<{ event: string; count: string }>(
      `SELECT event, COUNT(*)::int AS count
       FROM user_activities
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY event
       ORDER BY count DESC`,
    );
    return rows.map(r => ({ event: r.event, count: Number(r.count) }));
  },
};
