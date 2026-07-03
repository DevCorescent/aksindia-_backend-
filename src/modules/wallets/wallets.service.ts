import { queryOne, query, execute } from '../../config/db';

export const walletsService = {
  async getWallet(userId: string) {
    const row = await queryOne('SELECT * FROM wallets WHERE user_id = $1', [userId]);
    if (!row) throw new Error('Wallet not found');
    return row;
  },

  async getTransactions(walletId: string) {
    return query(
      'SELECT * FROM wallet_transactions WHERE wallet_id = $1 ORDER BY created_at DESC',
      [walletId],
    );
  },

  async credit(userId: string, amount: number, description: string, referenceId?: string): Promise<void> {
    const wallet = await queryOne<{ id: string; balance: number; total_earned: number }>(
      'SELECT id, balance, total_earned FROM wallets WHERE user_id = $1',
      [userId],
    );
    if (!wallet) throw new Error('Wallet not found');
    await execute(
      'UPDATE wallets SET balance = $1, total_earned = $2, updated_at = NOW() WHERE id = $3',
      [wallet.balance + amount, wallet.total_earned + amount, wallet.id],
    );
    await execute(
      `INSERT INTO wallet_transactions (wallet_id, type, amount, description, reference_id, reference_type)
       VALUES ($1, 'credit', $2, $3, $4, 'order')`,
      [wallet.id, amount, description, referenceId ?? null],
    );
  },

  async ensureWallet(userId: string): Promise<void> {
    await execute(
      'INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
      [userId],
    );
  },
};
