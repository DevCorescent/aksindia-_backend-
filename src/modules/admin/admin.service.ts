import { query, queryOne, execute } from '../../config/db';
import { mapProfile } from '../../utils/mappers';
import type { User } from '../../types';

export const adminService = {
  async listUsers(): Promise<User[]> {
    const rows = await query('SELECT * FROM profiles ORDER BY created_at DESC');
    return rows.map(mapProfile);
  },

  async updateUser(userId: string, patch: { name?: string; role?: string; is_active?: boolean; city?: string; state?: string }): Promise<User> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (patch.name      !== undefined) { fields.push(`name = $${i++}`);      values.push(patch.name); }
    if (patch.role      !== undefined) { fields.push(`role = $${i++}`);      values.push(patch.role); }
    if (patch.is_active !== undefined) { fields.push(`is_active = $${i++}`); values.push(patch.is_active); }
    if (patch.city      !== undefined) { fields.push(`city = $${i++}`);      values.push(patch.city); }
    if (patch.state     !== undefined) { fields.push(`state = $${i++}`);     values.push(patch.state); }
    if (fields.length === 0) { const r = await queryOne('SELECT * FROM profiles WHERE id = $1', [userId]); if (!r) throw new Error('User not found'); return mapProfile(r); }
    values.push(userId);
    const row = await queryOne(
      `UPDATE profiles SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
      values,
    );
    if (!row) throw new Error('User not found');
    return mapProfile(row);
  },

  async deleteUser(userId: string): Promise<void> {
    await execute('DELETE FROM profiles WHERE id = $1', [userId]);
  },

  async listCustomRoles() {
    return query('SELECT * FROM custom_roles ORDER BY created_at DESC');
  },

  async createRole(payload: { name: string; description: string; permissions: string[]; color: string }) {
    const row = await queryOne(
      'INSERT INTO custom_roles (name, description, permissions, color) VALUES ($1,$2,$3,$4) RETURNING *',
      [payload.name, payload.description, payload.permissions, payload.color],
    );
    if (!row) throw new Error('Create failed');
    return row;
  },

  async updateRole(id: string, patch: Partial<{ name: string; description: string; permissions: string[]; color: string }>) {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (patch.name        !== undefined) { fields.push(`name = $${i++}`);        values.push(patch.name); }
    if (patch.description !== undefined) { fields.push(`description = $${i++}`); values.push(patch.description); }
    if (patch.permissions !== undefined) { fields.push(`permissions = $${i++}`); values.push(patch.permissions); }
    if (patch.color       !== undefined) { fields.push(`color = $${i++}`);       values.push(patch.color); }
    if (fields.length === 0) throw new Error('Nothing to update');
    values.push(id);
    const row = await queryOne(
      `UPDATE custom_roles SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values,
    );
    if (!row) throw new Error('Role not found');
    return row;
  },

  async deleteRole(id: string): Promise<void> {
    await execute('DELETE FROM custom_roles WHERE id = $1', [id]);
  },

  async getRevenueSummary() {
    const [orders, serviceOrders] = await Promise.all([
      query("SELECT total, admin_revenue, commission_total, created_at FROM orders WHERE payment_status = 'paid'"),
      query('SELECT amount, created_at FROM service_orders'),
    ]);
    return { orders, serviceOrders };
  },
};
