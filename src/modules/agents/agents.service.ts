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
  async list(statusFilter?: string): Promise<Agent[]> {
    const params: unknown[] = [];
    let sql = AGENT_JOIN;
    if (statusFilter) sql += ` WHERE a.status = $${params.push(statusFilter)}`;
    sql += ' ORDER BY a.created_at DESC';
    const rows = await query(sql, params);
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
      [agentId, payload.agentCode, payload.commissionRate, payload.status ?? 'pending'],
    );
  },

  async approve(id: string, adminId: string): Promise<Agent> {
    await execute(
      "UPDATE agents SET status = 'active', activated_at = NOW(), activated_by = $1, updated_at = NOW() WHERE id = $2",
      [adminId, id],
    );
    const agent = await this.getById(id);
    await execute(
      "INSERT INTO notifications (user_id, type, title, message) VALUES ($1, 'system', 'Agent Approved', 'Congratulations! Your agent application has been approved. You can now start earning commissions.')",
      [id],
    );
    return agent;
  },

  async reject(id: string): Promise<Agent> {
    await execute(
      "UPDATE agents SET status = 'rejected', updated_at = NOW() WHERE id = $1",
      [id],
    );
    const agent = await this.getById(id);
    await execute(
      "INSERT INTO notifications (user_id, type, title, message) VALUES ($1, 'system', 'Agent Application Update', 'Your agent application was not approved at this time.')",
      [id],
    );
    return agent;
  },

  async getEarnings(id: string) {
    const [agent, wallet] = await Promise.all([
      this.getById(id),
      queryOne('SELECT * FROM wallets WHERE user_id = $1', [id]),
    ]);
    if (!wallet) throw new Error('Wallet not found');
    const walletRow = wallet as Record<string, unknown>;
    const transactions = await query(
      'SELECT * FROM wallet_transactions WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT 100',
      [walletRow.id],
    );
    const referredOrders = await query(
      "SELECT id, customer_name, total, agent_commission, status, created_at FROM orders WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 50",
      [id],
    );
    return {
      agent,
      wallet: {
        balance:     Number(walletRow.balance),
        pending:     Number(walletRow.pending),
        totalEarned: Number(walletRow.total_earned),
        withdrawn:   Number(walletRow.withdrawn),
      },
      transactions,
      referredOrders,
    };
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
