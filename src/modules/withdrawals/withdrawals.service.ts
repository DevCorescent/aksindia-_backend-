import { query, queryOne } from '../../config/db';
import type { WithdrawalRequest } from '../../types';
import { mapWithdrawal } from '../../utils/mappers';

export const withdrawalsService = {
  async list(entityId?: string): Promise<WithdrawalRequest[]> {
    let sql = 'SELECT * FROM withdrawal_requests';
    const params: unknown[] = [];
    if (entityId) { sql += ' WHERE entity_id = $1'; params.push(entityId); }
    sql += ' ORDER BY requested_at DESC';
    const rows = await query(sql, params);
    return rows.map(mapWithdrawal);
  },

  async create(payload: Omit<WithdrawalRequest, 'id'>): Promise<WithdrawalRequest> {
    const row = await queryOne(
      `INSERT INTO withdrawal_requests
        (entity_type, entity_id, entity_name, owner_name, amount, bank_account, ifsc, status, note, requested_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        payload.entityType, payload.entityId, payload.entityName, payload.ownerName,
        payload.amount, payload.bankAccount, payload.ifsc, payload.status,
        payload.note ?? null, payload.requestedAt ?? new Date().toISOString(),
      ],
    );
    if (!row) throw new Error('Create failed');
    return mapWithdrawal(row);
  },

  async update(id: string, patch: Partial<WithdrawalRequest>): Promise<WithdrawalRequest> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (patch.status      !== undefined) { fields.push(`status = $${i++}`);       values.push(patch.status); }
    if (patch.note        !== undefined) { fields.push(`note = $${i++}`);         values.push(patch.note); }
    if (patch.processedAt !== undefined) { fields.push(`processed_at = $${i++}`); values.push(patch.processedAt); }
    if (fields.length === 0) { const row = await queryOne('SELECT * FROM withdrawal_requests WHERE id = $1', [id]); if (!row) throw new Error('Not found'); return mapWithdrawal(row); }
    values.push(id);
    const row = await queryOne(
      `UPDATE withdrawal_requests SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values,
    );
    if (!row) throw new Error('Not found');
    return mapWithdrawal(row);
  },
};
