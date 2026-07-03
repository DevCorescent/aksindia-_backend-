import type { Request, Response } from 'express';
import { withdrawalsService } from './withdrawals.service';
import { ok, created, serverError } from '../../utils/response';

export const withdrawalsController = {
  async list(req: Request, res: Response): Promise<void> {
    try {
      const entityId = req.user!.role === 'admin' ? undefined : req.user!.id;
      ok(res, await withdrawalsService.list(entityId));
    } catch (e) { serverError(res, (e as Error).message); }
  },
  async create(req: Request, res: Response): Promise<void> {
    try { created(res, await withdrawalsService.create(req.body, req.user!)); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async update(req: Request, res: Response): Promise<void> {
    try { ok(res, await withdrawalsService.update(req.params.id, req.body)); }
    catch (e) { serverError(res, (e as Error).message); }
  },
};
