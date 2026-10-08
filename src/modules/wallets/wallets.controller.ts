import type { Request, Response } from 'express';
import { walletsService } from './wallets.service';
import { ok, created, serverError, badRequest } from '../../utils/response';

export const walletsController = {
  async getMyWallet(req: Request, res: Response): Promise<void> {
    try {
      const wallet = await walletsService.getWallet(req.user!.id);
      const transactions = await walletsService.getTransactions(wallet.id);
      // Spread wallet fields to top level so frontend can read balance, total_earned etc. directly
      ok(res, { ...wallet, transactions });
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async credit(req: Request, res: Response): Promise<void> {
    try {
      const { userId, amount, description, referenceId } = req.body as { userId: string; amount: number; description: string; referenceId?: string };
      await walletsService.credit(userId, amount, description, referenceId);
      ok(res, { message: 'Credited' });
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async debitSelf(req: Request, res: Response): Promise<void> {
    try {
      const { amount, description, referenceId } = req.body as { amount: number; description: string; referenceId?: string };
      if (!amount || amount <= 0) { badRequest(res, 'amount must be positive'); return; }
      if (!description) { badRequest(res, 'description is required'); return; }
      // Always use the authenticated user's own id — never accept userId from body
      await walletsService.debitSelf(req.user!.id, amount, description, referenceId);
      ok(res, { message: 'Debited' });
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async ensure(req: Request, res: Response): Promise<void> {
    try {
      await walletsService.ensureWallet(req.body.userId ?? req.user!.id);
      created(res, { message: 'Wallet ensured' });
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async adminListWallets(_req: Request, res: Response): Promise<void> {
    try {
      const wallets = await walletsService.adminListWallets();
      ok(res, wallets);
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async adminDebit(req: Request, res: Response): Promise<void> {
    try {
      const { userId, amount, description } = req.body as { userId: string; amount: number; description: string };
      await walletsService.adminDebit(userId, amount, description);
      ok(res, { message: 'Debited' });
    } catch (e) { serverError(res, (e as Error).message); }
  },
};
