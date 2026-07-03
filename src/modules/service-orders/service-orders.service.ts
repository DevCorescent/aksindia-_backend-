import { query, queryOne } from '../../config/db';
import type { ServiceOrder, UserRole } from '../../types';
import { mapServiceOrder } from '../../utils/mappers';

export const serviceOrdersService = {
  async list(role: UserRole, userId?: string): Promise<ServiceOrder[]> {
    let sql = 'SELECT * FROM service_orders';
    const params: unknown[] = [];
    const where: string[] = [];
    if (role === 'customer'         && userId) { where.push(`customer_id = $${params.push(userId)}`); }
    if (role === 'service_provider' && userId) { where.push(`provider_id = $${params.push(userId)}`); }
    if (role === 'agent'            && userId) { where.push(`agent_id = $${params.push(userId)}`); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    const rows = await query(sql, params);
    return rows.map(mapServiceOrder);
  },

  async getById(id: string): Promise<ServiceOrder> {
    const row = await queryOne('SELECT * FROM service_orders WHERE id = $1', [id]);
    if (!row) throw new Error('Service order not found');
    return mapServiceOrder(row);
  },

  async create(payload: Omit<ServiceOrder, 'id'>): Promise<ServiceOrder> {
    const orderId = 'SVC' + Date.now().toString(36).toUpperCase();
    const row = await queryOne(
      `INSERT INTO service_orders
        (id, service_id, service_title, service_icon, service_color, provider_id, provider_name,
         customer_id, customer_name, customer_email, customer_phone, amount, status, payment_status,
         scheduled_date, address, city, notes, agent_id, agent_name, agent_code, agent_commission)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending',$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      [
        orderId, payload.serviceId, payload.serviceTitle, payload.serviceIcon, payload.serviceColor,
        payload.providerId, payload.providerName, payload.customerId, payload.customerName,
        payload.customerEmail, payload.customerPhone ?? null, payload.amount, payload.status,
        payload.scheduledDate, payload.address, payload.city, payload.notes ?? null,
        payload.agentId ?? null, payload.agentName ?? null,
        payload.agentCode ?? null, payload.agentCommission ?? null,
      ],
    );
    if (!row) throw new Error('Create failed');
    return mapServiceOrder(row);
  },

  async update(id: string, patch: Partial<ServiceOrder>): Promise<ServiceOrder> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (patch.status !== undefined) { fields.push(`status = $${i++}`); values.push(patch.status); }
    if (patch.notes  !== undefined) { fields.push(`notes = $${i++}`);  values.push(patch.notes); }
    if (fields.length === 0) return this.getById(id);
    values.push(id);
    const row = await queryOne(
      `UPDATE service_orders SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values,
    );
    if (!row) throw new Error('Service order not found');
    return mapServiceOrder(row);
  },
};
