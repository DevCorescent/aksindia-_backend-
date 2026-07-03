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
};
