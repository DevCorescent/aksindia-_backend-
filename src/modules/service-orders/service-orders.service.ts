import { query, queryOne, execute } from '../../config/db';
import type { ServiceOrder, UserRole } from '../../types';
import { mapServiceOrder } from '../../utils/mappers';
import { walletsService } from '../wallets/wallets.service';
import { orderHistoryService } from '../orders/order-history.service';

export const serviceOrdersService = {
  async list(role: UserRole, userId?: string): Promise<ServiceOrder[]> {
    const params: unknown[] = [];
    const where: string[] = [];
    if (role === 'customer')              where.push(`customer_id = $${params.push(userId)}`);
    else if (role === 'service_provider') where.push(`provider_id = $${params.push(userId)}`);
    else if (role === 'agent')            where.push(`agent_id = $${params.push(userId)}`);
    else if (role !== 'admin')            return [];
    const sql = `SELECT * FROM service_orders${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`;
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
         customer_id, customer_name, customer_email, customer_phone, amount, status,
         scheduled_date, address, city, notes, agent_id, agent_name, agent_code, agent_commission)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        orderId, payload.serviceId, payload.serviceTitle, payload.serviceIcon, payload.serviceColor,
        payload.providerId, payload.providerName, payload.customerId, payload.customerName,
        payload.customerEmail, payload.customerPhone ?? null, payload.amount,
        payload.scheduledDate, payload.address, payload.city, payload.notes ?? null,
        payload.agentId ?? null, payload.agentName ?? null,
        payload.agentCode ?? null, payload.agentCommission ?? null,
      ],
    );
    if (!row) throw new Error('Create failed');
    const order = mapServiceOrder(row);
    await orderHistoryService.record(order.id, 'service', order.status, payload.customerId);
    return order;
  },

  async complete(id: string, changedBy?: string): Promise<ServiceOrder> {
    const row = await queryOne(
      `UPDATE service_orders SET status = 'completed' WHERE id = $1 AND status NOT IN ('completed','cancelled') RETURNING *`,
      [id],
    );
    if (!row) throw new Error('Service order not found or already finalized');
    const order = mapServiceOrder(row);
    await orderHistoryService.record(id, 'service', 'completed', changedBy);

    // Credit provider wallet (full amount; platform takes commission separately)
    const providerCredit = order.amount - (order.agentCommission ?? 0);
    if (providerCredit > 0) {
      await walletsService.credit(
        order.providerId, providerCredit,
        `Service order ${order.id} completed`, order.id, 'service_order',
      );
    }

    // Credit agent commission if applicable
    if (order.agentCommission && order.agentCommission > 0 && order.agentId) {
      await walletsService.credit(
        order.agentId, order.agentCommission,
        `Commission for service order ${order.id}`, order.id, 'commission',
      );
      await execute(
        'UPDATE agents SET total_earned = total_earned + $1, total_orders = total_orders + 1 WHERE id = $2',
        [order.agentCommission, order.agentId],
      );
    }

    // Notify customer
    await execute(
      "INSERT INTO notifications (user_id, type, title, message) VALUES ($1, 'order', 'Service Completed', $2)",
      [order.customerId, `Your service "${order.serviceTitle}" has been marked as completed.`],
    );

    return order;
  },

  async cancel(id: string, reason: string, cancelledBy: string): Promise<ServiceOrder> {
    const row = await queryOne(
      `UPDATE service_orders SET status = 'cancelled', notes = COALESCE(notes || E'\n', '') || $1
       WHERE id = $2 AND status NOT IN ('completed','cancelled') RETURNING *`,
      [`Cancelled: ${reason}`, id],
    );
    if (!row) throw new Error('Service order not found or already finalized');
    const order = mapServiceOrder(row);
    await orderHistoryService.record(id, 'service', 'cancelled', cancelledBy, reason);

    // Notify the other party
    const notifyUserId = cancelledBy === order.customerId ? order.providerId : order.customerId;
    await execute(
      "INSERT INTO notifications (user_id, type, title, message) VALUES ($1, 'order', 'Service Order Cancelled', $2)",
      [notifyUserId, `Service order for "${order.serviceTitle}" was cancelled. Reason: ${reason}`],
    );

    return order;
  },

  async reject(id: string, reason: string, changedBy?: string): Promise<ServiceOrder> {
    const row = await queryOne(
      `UPDATE service_orders SET status = 'rejected' WHERE id = $1 AND status = 'pending' RETURNING *`,
      [id],
    );
    if (!row) throw new Error('Service order not found or not in pending state');
    const order = mapServiceOrder(row);
    await orderHistoryService.record(id, 'service', 'rejected', changedBy, reason);

    await execute(
      "INSERT INTO notifications (user_id, type, title, message) VALUES ($1, 'order', 'Service Request Declined', $2)",
      [order.customerId, `Your service request for "${order.serviceTitle}" was declined by the provider. Reason: ${reason}`],
    );

    return order;
  },

  async update(id: string, patch: Partial<ServiceOrder>, changedBy?: string): Promise<ServiceOrder> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (patch.status        !== undefined) { fields.push(`status = $${i++}`);         values.push(patch.status); }
    if (patch.scheduledDate !== undefined) { fields.push(`scheduled_date = $${i++}`); values.push(patch.scheduledDate); }
    if (patch.notes         !== undefined) { fields.push(`notes = $${i++}`);          values.push(patch.notes); }
    if (fields.length === 0) return this.getById(id);
    values.push(id);
    const row = await queryOne(
      `UPDATE service_orders SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values,
    );
    if (!row) throw new Error('Service order not found');
    const updated = mapServiceOrder(row);
    if (patch.status !== undefined) {
      await orderHistoryService.record(id, 'service', updated.status, changedBy);
    }
    return updated;
  },
};
