import type { PoolClient } from 'pg';
import { query } from '../../config/db';
import type { WithdrawalRequest } from '../../types';
import { mapWithdrawal } from '../../utils/mappers';
import { walletsService, withTransaction } from '../wallets/wallets.service';

// Statuses from which no further money movement is allowed.
const FINALIZED = ['processed', 'rejected'];

// Minimum withdrawal amount in INR (mirrors the frontend's
// VITE_MIN_WITHDRAWAL_AMOUNT). Kept as a module constant rather than in the
// shared env config to respect module ownership; move to config/env if approved.
const MIN_WITHDRAWAL_AMOUNT = 500;

// The actor performing the request — the authenticated user from req.user.
interface Actor {
  id: string;
  role: string;
}

/**
 * Resolve the profile/user id whose wallet backs a withdrawal entity.
 * - agent / service_provider: entity_id IS the profile id (== wallet user_id)
 * - store: entity_id is the store id, so we resolve the store's owner
 */
async function resolveWalletUserId(
  client: PoolClient,
  entityType: WithdrawalRequest['entityType'],
  entityId: string,
): Promise<string> {
  if (entityType === 'store') {
    const { rows } = await client.query<{ owner_id: string }>(
      'SELECT owner_id FROM stores WHERE id = $1',
      [entityId],
    );
    if (!rows[0]) throw new Error('Store not found');
    return rows[0].owner_id;
  }
  return entityId;
}

export const withdrawalsService = {
  async list(entityId?: string): Promise<WithdrawalRequest[]> {
    let sql = 'SELECT * FROM withdrawal_requests';
    const params: unknown[] = [];
    if (entityId) { sql += ' WHERE entity_id = $1'; params.push(entityId); }
    sql += ' ORDER BY requested_at DESC';
    const rows = await query(sql, params);
    return rows.map(mapWithdrawal);
  },

  /**
   * Create a withdrawal request AND hold the funds, atomically.
   * The request is always created as 'pending' (a client cannot pre-approve it),
   * and the amount is moved balance → pending in the same transaction. If the
   * wallet lacks the balance, the whole thing rolls back and nothing is created.
   *
   * Ownership (#2): a non-admin may only withdraw from their own account. We
   * resolve the wallet owner from the entity and require it to match the actor,
   * so a caller cannot file a withdrawal against someone else's entityId.
   */
  async create(
    payload: Omit<WithdrawalRequest, 'id' | 'status'>,
    actor: Actor,
  ): Promise<WithdrawalRequest> {
    const amount = Number(payload.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be positive');
    if (amount < MIN_WITHDRAWAL_AMOUNT) {
      throw new Error(`Minimum withdrawal amount is ₹${MIN_WITHDRAWAL_AMOUNT}`);
    }

    return withTransaction(async (client) => {
      const userId = await resolveWalletUserId(client, payload.entityType, payload.entityId);

      // #2 ownership guard — non-admins can only withdraw from their own wallet.
      if (actor.role !== 'admin' && userId !== actor.id) {
        throw new Error('You can only request withdrawals for your own account');
      }

      const { rows } = await client.query(
        `INSERT INTO withdrawal_requests
          (entity_type, entity_id, entity_name, owner_name, amount, bank_account, ifsc, status, note, requested_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9)
         RETURNING *`,
        [
          payload.entityType, payload.entityId, payload.entityName, payload.ownerName,
          amount, payload.bankAccount, payload.ifsc,
          payload.note ?? null, payload.requestedAt ?? new Date().toISOString(),
        ],
      );
      const row = rows[0];
      if (!row) throw new Error('Create failed');

      // Hold funds: balance → pending. Throws (→ rollback) if insufficient.
      await walletsService.hold(client, userId, amount, row.id);

      return mapWithdrawal(row);
    });
  },

  /**
   * Update a withdrawal, moving money on status transitions, atomically:
   * - → processed: pending → withdrawn (payout leaves the platform)
   * - → rejected:  pending → balance   (hold reversed, funds returned)
   * - → approved:  status only (funds stay held)
   * A request that is already processed/rejected cannot transition again.
   */
  async update(id: string, patch: Partial<WithdrawalRequest>): Promise<WithdrawalRequest> {
    return withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM withdrawal_requests WHERE id = $1 FOR UPDATE',
        [id],
      );
      const current = rows[0];
      if (!current) throw new Error('Withdrawal not found');

      const nextStatus = patch.status;
      const amount = Number(current.amount);

      if (nextStatus && nextStatus !== current.status) {
        if (FINALIZED.includes(current.status)) {
          throw new Error(`Withdrawal already ${current.status}`);
        }
        const userId = await resolveWalletUserId(client, current.entity_type, current.entity_id);
        if (nextStatus === 'processed') {
          await walletsService.settle(client, userId, amount, id);
        } else if (nextStatus === 'rejected') {
          await walletsService.refund(client, userId, amount, id);
        }
        // 'approved' (or back to 'pending') → no money movement
      }

      const fields: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      if (patch.status !== undefined) { fields.push(`status = $${i++}`); values.push(patch.status); }
      if (patch.note   !== undefined) { fields.push(`note = $${i++}`);   values.push(patch.note); }

      // Stamp processed_at automatically when finalizing (unless caller set it).
      if (nextStatus && FINALIZED.includes(nextStatus)) {
        fields.push(`processed_at = $${i++}`);
        values.push(patch.processedAt ?? new Date().toISOString());
      } else if (patch.processedAt !== undefined) {
        fields.push(`processed_at = $${i++}`);
        values.push(patch.processedAt);
      }

      if (fields.length === 0) return mapWithdrawal(current);
      values.push(id);
      const { rows: updated } = await client.query(
        `UPDATE withdrawal_requests SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
        values,
      );
      return mapWithdrawal(updated[0]);
    });
  },
};
