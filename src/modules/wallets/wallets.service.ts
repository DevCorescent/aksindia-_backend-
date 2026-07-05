import type { PoolClient } from 'pg';
import { pool, queryOne, query, execute } from '../../config/db';

/**
 * Runs `fn` inside a single DB transaction (BEGIN / COMMIT, ROLLBACK on throw).
 *
 * NOTE: this would ideally live in the shared `config/db.ts`, but that file is
 * outside this module's ownership, so the helper lives here for now. Move it to
 * config/db.ts if a shared transaction helper is later approved.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

interface WalletRow {
  id: string;
  balance: string;
  pending: string;
  total_earned: string;
  withdrawn: string;
}

type TxnType = 'credit' | 'debit' | 'pending' | 'refund';

/** Locks the wallet row FOR UPDATE so concurrent transactions serialize on it. */
async function lockWallet(client: PoolClient, userId: string): Promise<WalletRow> {
  const { rows } = await client.query<WalletRow>(
    'SELECT id, balance, pending, total_earned, withdrawn FROM wallets WHERE user_id = $1 FOR UPDATE',
    [userId],
  );
  if (!rows[0]) throw new Error('Wallet not found');
  return rows[0];
}

async function insertTxn(
  client: PoolClient,
  walletId: string,
  type: TxnType,
  amount: number,
  description: string,
  referenceId: string | null,
  referenceType: string,
): Promise<void> {
  await client.query(
    `INSERT INTO wallet_transactions (wallet_id, type, amount, description, reference_id, reference_type)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [walletId, type, amount, description, referenceId, referenceType],
  );
}

export const walletsService = {
  async getWallet(userId: string) {
    const row = await queryOne<{ id: string } & Record<string, unknown>>(
      'SELECT * FROM wallets WHERE user_id = $1',
      [userId],
    );
    if (!row) throw new Error('Wallet not found');
    return row;
  },

  async getTransactions(walletId: string) {
    return query(
      'SELECT * FROM wallet_transactions WHERE wallet_id = $1 ORDER BY created_at DESC',
      [walletId],
    );
  },

  async ensureWallet(userId: string): Promise<void> {
    await execute(
      'INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
      [userId],
    );
  },

  /**
   * Admin/system credit into a wallet's spendable balance. Now atomic (the
   * balance update and the ledger row succeed or fail together) and the
   * transaction's reference_type is configurable instead of hardcoded 'order'.
   */
  async credit(
    userId: string,
    amount: number,
    description: string,
    referenceId?: string,
    referenceType = 'order',
  ): Promise<void> {
    if (!(amount > 0)) throw new Error('Amount must be positive');
    await withTransaction(async (client) => {
      const w = await lockWallet(client, userId);
      await client.query(
        'UPDATE wallets SET balance = balance + $1, total_earned = total_earned + $1, updated_at = NOW() WHERE id = $2',
        [amount, w.id],
      );
      await insertTxn(client, w.id, 'credit', amount, description, referenceId ?? null, referenceType);
    });
  },

  // ── Transaction participants ────────────────────────────────────────────────
  // These accept an existing PoolClient so they run inside the caller's
  // transaction (e.g. the withdrawals flow) — the money movement and the
  // withdrawal row change commit atomically or roll back together.

  /** Withdrawal requested: move funds from spendable balance into a pending hold. */
  async hold(client: PoolClient, userId: string, amount: number, referenceId: string): Promise<void> {
    const w = await lockWallet(client, userId);
    if (Number(w.balance) < amount) throw new Error('Insufficient balance');
    await client.query(
      'UPDATE wallets SET balance = balance - $1, pending = pending + $1, updated_at = NOW() WHERE id = $2',
      [amount, w.id],
    );
    await insertTxn(client, w.id, 'pending', amount, 'Withdrawal requested', referenceId, 'withdrawal');
  },

  /** Withdrawal processed: finalize the hold (pending → withdrawn); money has left. */
  async settle(client: PoolClient, userId: string, amount: number, referenceId: string): Promise<void> {
    const w = await lockWallet(client, userId);
    if (Number(w.pending) < amount) throw new Error('Pending balance too low to settle');
    await client.query(
      'UPDATE wallets SET pending = pending - $1, withdrawn = withdrawn + $1, updated_at = NOW() WHERE id = $2',
      [amount, w.id],
    );
    await insertTxn(client, w.id, 'debit', amount, 'Withdrawal processed', referenceId, 'withdrawal');
  },

  /** Withdrawal rejected: reverse the hold (pending → spendable balance). */
  async refund(client: PoolClient, userId: string, amount: number, referenceId: string): Promise<void> {
    const w = await lockWallet(client, userId);
    if (Number(w.pending) < amount) throw new Error('Pending balance too low to refund');
    await client.query(
      'UPDATE wallets SET pending = pending - $1, balance = balance + $1, updated_at = NOW() WHERE id = $2',
      [amount, w.id],
    );
    await insertTxn(client, w.id, 'refund', amount, 'Withdrawal rejected', referenceId, 'withdrawal');
  },
};
