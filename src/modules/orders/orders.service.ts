import { query, queryOne } from '../../config/db';
import type { Order, UserRole } from '../../types';
import { mapOrder } from '../../utils/mappers';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ordersService = {
  async list(role: UserRole, userId?: string, storeId?: string): Promise<Order[]> {
    let sql = 'SELECT * FROM orders';
    const params: unknown[] = [];
    const where: string[] = [];
    if (role === 'customer'    && userId)  { where.push(`customer_id = $${params.push(userId)}`); }
    if (role === 'store_owner' && storeId) { where.push(`store_id = $${params.push(storeId)}`); }
    if (role === 'agent'       && userId)  { where.push(`agent_id = $${params.push(userId)}`); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    const rows = await query(sql, params);
    return rows.map(mapOrder);
  },

  async getById(id: string): Promise<Order> {
    const row = await queryOne('SELECT * FROM orders WHERE id = $1', [id]);
    if (!row) throw new Error('Order not found');
    return mapOrder(row);
  },

  async create(payload: Omit<Order, 'id'>): Promise<Order> {
    const orderId = 'ORD' + Date.now().toString(36).toUpperCase();
    const storeId = payload.storeId && UUID_RE.test(payload.storeId) ? payload.storeId : null;
    const row = await queryOne(
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
        payload.status, payload.paymentMethod, payload.paymentStatus,
        payload.address, payload.city,
        payload.agentId ?? null, payload.agentName ?? null,
        payload.agentCode ?? null, payload.agentCommission ?? null,
      ],
    );
    if (!row) throw new Error('Create failed');
    return mapOrder(row);
  },

  async update(id: string, patch: Partial<Order>): Promise<Order> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (patch.status         !== undefined) { fields.push(`status = $${i++}`);          values.push(patch.status); }
    if (patch.paymentStatus  !== undefined) { fields.push(`payment_status = $${i++}`);  values.push(patch.paymentStatus); }
    if (patch.paymentMethod  !== undefined) { fields.push(`payment_method = $${i++}`);  values.push(patch.paymentMethod); }
    if (patch.trackingNumber !== undefined) { fields.push(`tracking_number = $${i++}`); values.push(patch.trackingNumber); }
    if (patch.courierName    !== undefined) { fields.push(`courier_name = $${i++}`);    values.push(patch.courierName); }
    if (patch.cancelReason   !== undefined) { fields.push(`cancel_reason = $${i++}`);   values.push(patch.cancelReason); }
    if (fields.length === 0) return this.getById(id);
    values.push(id);
    const row = await queryOne(
      `UPDATE orders SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values,
    );
    if (!row) throw new Error('Order not found');
    return mapOrder(row);
  },
};
