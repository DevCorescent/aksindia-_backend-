import type { Request, Response } from 'express';
import { walletsService } from './wallets.service';
import { ok, created, serverError } from '../../utils/response';

export const walletsController = {
  async getMyWallet(req: Request, res: Response): Promise<void> {
    try {
      const wallet = await walletsService.getWallet(req.user!.id);
      const transactions = await walletsService.getTransactions(wallet.id);
      ok(res, { wallet, transactions });
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async credit(req: Request, res: Response): Promise<void> {
    try {
      const { userId, amount, description, referenceId } = req.body as { userId: string; amount: number; description: string; referenceId?: string };
      await walletsService.credit(userId, amount, description, referenceId);
      ok(res, { message: 'Credited' });
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async ensure(req: Request, res: Response): Promise<void> {
    try {
      await walletsService.ensureWallet(req.body.userId ?? req.user!.id);
      created(res, { message: 'Wallet ensured' });
    } catch (e) { serverError(res, (e as Error).message); }
  },
};
