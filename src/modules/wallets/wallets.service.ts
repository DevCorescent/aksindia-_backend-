import type { PoolClient } from 'pg';
import { pool, queryOne, query, execute } from '../../config/db';
import { logger } from '../../utils/logger';

const TAG = 'Wallet';

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

async function lockWallet(client: PoolClient, userId: string): Promise<WalletRow> {
  const { rows } = await client.query<WalletRow>(
    'SELECT id, balance, pending, total_earned, withdrawn FROM wallets WHERE user_id = $1 FOR UPDATE',
    [userId],
  );
  if (!rows[0]) throw new Error(`Wallet not found for userId=${userId}`);
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
    logger.debug(TAG, 'getWallet called', { userId });
    const row = await queryOne<{ id: string } & Record<string, unknown>>(
      'SELECT * FROM wallets WHERE user_id = $1',
      [userId],
    );
    if (!row) {
      logger.warn(TAG, 'getWallet: wallet not found', { userId });
      throw new Error('Wallet not found');
    }
    logger.debug(TAG, 'getWallet: found', { userId, walletId: row.id, balance: row.balance });
    return row;
  },

  async getTransactions(walletId: string) {
    logger.debug(TAG, 'getTransactions called', { walletId });
    const rows = await query(
      'SELECT * FROM wallet_transactions WHERE wallet_id = $1 ORDER BY created_at DESC',
      [walletId],
    );
    logger.debug(TAG, 'getTransactions: result', { walletId, count: rows.length });
    return rows;
  },

  async ensureWallet(userId: string): Promise<void> {
    logger.info(TAG, 'ensureWallet called', { userId });
    await execute(
      'INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
      [userId],
    );
    logger.info(TAG, 'ensureWallet done (created or already existed)', { userId });
  },

  async credit(
    userId: string,
    amount: number,
    description: string,
    referenceId?: string,
    referenceType = 'order',
  ): Promise<void> {
    logger.info(TAG, 'credit START', { userId, amount, description, referenceId, referenceType });

    if (!(amount > 0)) {
      logger.error(TAG, 'credit REJECTED: amount must be positive', { userId, amount });
      throw new Error('Amount must be positive');
    }

    await withTransaction(async (client) => {
      logger.debug(TAG, 'credit: locking wallet row', { userId });
      const w = await lockWallet(client, userId);
      logger.info(TAG, 'credit: wallet locked', {
        walletId: w.id,
        balanceBefore: w.balance,
        totalEarnedBefore: w.total_earned,
      });

      await client.query(
        'UPDATE wallets SET balance = balance + $1, total_earned = total_earned + $1, updated_at = NOW() WHERE id = $2',
        [amount, w.id],
      );
      logger.info(TAG, 'credit: wallets row updated', { walletId: w.id, credited: amount });

      await insertTxn(client, w.id, 'credit', amount, description, referenceId ?? null, referenceType);
      logger.info(TAG, 'credit: transaction row inserted', { walletId: w.id, referenceId, referenceType });
    });

    logger.info(TAG, 'credit COMMITTED', { userId, amount, referenceId });
  },

  async hold(client: PoolClient, userId: string, amount: number, referenceId: string): Promise<void> {
    logger.info(TAG, 'hold START', { userId, amount, referenceId });
    const w = await lockWallet(client, userId);
    if (Number(w.balance) < amount) {
      logger.error(TAG, 'hold REJECTED: insufficient balance', { userId, balance: w.balance, requested: amount });
      throw new Error('Insufficient balance');
    }
    await client.query(
      'UPDATE wallets SET balance = balance - $1, pending = pending + $1, updated_at = NOW() WHERE id = $2',
      [amount, w.id],
    );
    await insertTxn(client, w.id, 'pending', amount, 'Withdrawal requested', referenceId, 'withdrawal');
    logger.info(TAG, 'hold DONE', { userId, walletId: w.id, amount });
  },

  async settle(client: PoolClient, userId: string, amount: number, referenceId: string): Promise<void> {
    logger.info(TAG, 'settle START', { userId, amount, referenceId });
    const w = await lockWallet(client, userId);
    if (Number(w.pending) < amount) {
      logger.error(TAG, 'settle REJECTED: pending balance too low', { userId, pending: w.pending, requested: amount });
      throw new Error('Pending balance too low to settle');
    }
    await client.query(
      'UPDATE wallets SET pending = pending - $1, withdrawn = withdrawn + $1, updated_at = NOW() WHERE id = $2',
      [amount, w.id],
    );
    await insertTxn(client, w.id, 'debit', amount, 'Withdrawal processed', referenceId, 'withdrawal');
    logger.info(TAG, 'settle DONE', { userId, walletId: w.id, amount });
  },

  async adminListWallets() {
    logger.debug(TAG, 'adminListWallets called');
    return query(
      `SELECT w.id, w.user_id, w.balance, w.pending, w.total_earned, w.withdrawn, w.updated_at,
              p.name, p.email, p.role, p.city
       FROM wallets w
       JOIN profiles p ON p.id = w.user_id
       ORDER BY w.balance DESC`,
      [],
    );
  },

  /** User pays for their own order — debits caller's wallet, not admin-only. */
  async debitSelf(
    userId: string,
    amount: number,
    description: string,
    referenceId?: string,
  ): Promise<void> {
    logger.info(TAG, 'debitSelf START', { userId, amount, description, referenceId });

    if (!(amount > 0)) {
      logger.error(TAG, 'debitSelf REJECTED: amount must be positive', { userId, amount });
      throw new Error('Amount must be positive');
    }

    await withTransaction(async (client) => {
      const w = await lockWallet(client, userId);
      logger.info(TAG, 'debitSelf: wallet locked', { walletId: w.id, balanceBefore: w.balance });

      if (Number(w.balance) < amount) {
        logger.error(TAG, 'debitSelf REJECTED: insufficient balance', { userId, balance: w.balance, requested: amount });
        throw new Error(`Insufficient wallet balance. Available: ₹${w.balance}, required: ₹${amount}`);
      }

      await client.query(
        'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
        [amount, w.id],
      );
      await insertTxn(client, w.id, 'debit', amount, description, referenceId ?? null, 'order');
      logger.info(TAG, 'debitSelf: row updated + txn inserted', { walletId: w.id, debited: amount, referenceId });
    });

    logger.info(TAG, 'debitSelf COMMITTED', { userId, amount });
  },

  async adminDebit(userId: string, amount: number, description: string, referenceId?: string): Promise<void> {
    logger.info(TAG, 'adminDebit START', { userId, amount, description, referenceId });

    if (!(amount > 0)) {
      logger.error(TAG, 'adminDebit REJECTED: amount must be positive', { userId, amount });
      throw new Error('Amount must be positive');
    }

    await withTransaction(async (client) => {
      const w = await lockWallet(client, userId);
      logger.info(TAG, 'adminDebit: wallet locked', { walletId: w.id, balanceBefore: w.balance });

      if (Number(w.balance) < amount) {
        logger.error(TAG, 'adminDebit REJECTED: insufficient balance', { userId, balance: w.balance, requested: amount });
        throw new Error('Insufficient wallet balance');
      }

      await client.query(
        'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
        [amount, w.id],
      );
      await insertTxn(client, w.id, 'debit', amount, description, referenceId ?? null, 'admin_adjustment');
      logger.info(TAG, 'adminDebit: row updated + txn inserted', { walletId: w.id, debited: amount });
    });

    logger.info(TAG, 'adminDebit COMMITTED', { userId, amount });
  },

  async refund(client: PoolClient, userId: string, amount: number, referenceId: string): Promise<void> {
    logger.info(TAG, 'refund START', { userId, amount, referenceId });
    const w = await lockWallet(client, userId);
    if (Number(w.pending) < amount) {
      logger.error(TAG, 'refund REJECTED: pending balance too low', { userId, pending: w.pending, requested: amount });
      throw new Error('Pending balance too low to refund');
    }
    await client.query(
      'UPDATE wallets SET pending = pending - $1, balance = balance + $1, updated_at = NOW() WHERE id = $2',
      [amount, w.id],
    );
    await insertTxn(client, w.id, 'refund', amount, 'Withdrawal rejected', referenceId, 'withdrawal');
    logger.info(TAG, 'refund DONE', { userId, walletId: w.id, amount });
  },
};
