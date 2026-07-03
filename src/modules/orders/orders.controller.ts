import type { Request, Response } from 'express';
import { ordersService } from './orders.service';
import { ok, created, serverError } from '../../utils/response';

export const ordersController = {
  async list(req: Request, res: Response): Promise<void> {
    try {
      const data = await ordersService.list(req.user!.role, req.user!.id, req.user!.storeId);
      ok(res, data);
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async getById(req: Request, res: Response): Promise<void> {
    try { ok(res, await ordersService.getById(req.params.id)); }
    catch (e) { serverError(res, (e as Error).message); }
  },

  async create(req: Request, res: Response): Promise<void> {
    try {
      const data = await ordersService.create(req.body);
      created(res, data);
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async update(req: Request, res: Response): Promise<void> {
    try { ok(res, await ordersService.update(req.params.id, req.body)); }
    catch (e) { serverError(res, (e as Error).message); }
  },
};
