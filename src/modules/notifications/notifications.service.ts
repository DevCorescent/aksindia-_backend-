import { query, execute } from '../../config/db';
import type { Notification } from '../../types';
import { mapNotification } from '../../utils/mappers';

export const notificationsService = {
  async list(userId: string): Promise<Notification[]> {
    const rows = await query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
      [userId],
    );
    return rows.map(mapNotification);
  },

  async create(userId: string, payload: Omit<Notification, 'id' | 'createdAt' | 'read'>): Promise<void> {
    await execute(
      'INSERT INTO notifications (user_id, type, title, message, link) VALUES ($1,$2,$3,$4,$5)',
      [userId, payload.type, payload.title, payload.message, payload.link ?? null],
    );
  },

  async markRead(id: string): Promise<void> {
    await execute('UPDATE notifications SET read = true WHERE id = $1', [id]);
  },

  async markAllRead(userId: string): Promise<void> {
    await execute('UPDATE notifications SET read = true WHERE user_id = $1', [userId]);
  },

  async remove(id: string): Promise<void> {
    await execute('DELETE FROM notifications WHERE id = $1', [id]);
  },
};
