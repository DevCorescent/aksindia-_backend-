import { query, queryOne, execute } from '../../config/db';
import type { Agent } from '../../types';
import { mapAgent } from '../../utils/mappers';

const AGENT_JOIN = `
  SELECT a.*, p.name, p.email, p.phone, p.city, p.state
  FROM agents a
  LEFT JOIN profiles p ON p.id = a.id
`;

function rowToAgent(row: Record<string, unknown>): Agent {
  return mapAgent({
    ...row,
    profiles: { name: row.name, email: row.email, phone: row.phone, city: row.city, state: row.state },
  });
}

export const agentsService = {
  async list(): Promise<Agent[]> {
    const rows = await query(`${AGENT_JOIN} ORDER BY a.created_at DESC`);
    return rows.map(r => rowToAgent(r as Record<string, unknown>));
  },

  async getById(id: string): Promise<Agent> {
    const row = await queryOne(`${AGENT_JOIN} WHERE a.id = $1`, [id]);
    if (!row) throw new Error('Agent not found');
    return rowToAgent(row as Record<string, unknown>);
  },

  async getByCode(code: string): Promise<Agent> {
    const row = await queryOne(`${AGENT_JOIN} WHERE a.agent_code = $1`, [code]);
    if (!row) throw new Error('Agent not found');
    return rowToAgent(row as Record<string, unknown>);
  },

  async create(agentId: string, payload: { agentCode: string; commissionRate: number; status: Agent['status'] }): Promise<void> {
    await execute(
      'INSERT INTO agents (id, agent_code, commission_rate, status) VALUES ($1, $2, $3, $4)',
      [agentId, payload.agentCode, payload.commissionRate, payload.status],
    );
  },

  async update(id: string, patch: Partial<Agent>): Promise<Agent> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (patch.status         !== undefined) { fields.push(`status = $${i++}`);          values.push(patch.status); }
    if (patch.commissionRate !== undefined) { fields.push(`commission_rate = $${i++}`); values.push(patch.commissionRate); }
    if (patch.walletBalance  !== undefined) { fields.push(`wallet_balance = $${i++}`);  values.push(patch.walletBalance); }
    if (patch.totalEarned    !== undefined) { fields.push(`total_earned = $${i++}`);    values.push(patch.totalEarned); }
    if (patch.totalOrders    !== undefined) { fields.push(`total_orders = $${i++}`);    values.push(patch.totalOrders); }
    if (patch.totalSales     !== undefined) { fields.push(`total_sales = $${i++}`);     values.push(patch.totalSales); }
    if (patch.activatedAt    !== undefined) { fields.push(`activated_at = $${i++}`);    values.push(patch.activatedAt); }
    if (patch.activatedBy    !== undefined) { fields.push(`activated_by = $${i++}`);    values.push(patch.activatedBy); }
    if (fields.length === 0) return this.getById(id);
    values.push(id);
    await execute(`UPDATE agents SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i}`, values);
    return this.getById(id);
  },
};
