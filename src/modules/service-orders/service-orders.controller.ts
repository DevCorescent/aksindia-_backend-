import type { Request, Response } from 'express';
import { serviceOrdersService } from './service-orders.service';
import { ok, created, serverError } from '../../utils/response';

export const serviceOrdersController = {
  async list(req: Request, res: Response): Promise<void> {
    try { ok(res, await serviceOrdersService.list(req.user!.role, req.user!.id)); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async getById(req: Request, res: Response): Promise<void> {
    try { ok(res, await serviceOrdersService.getById(req.params.id)); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async create(req: Request, res: Response): Promise<void> {
    try { created(res, await serviceOrdersService.create(req.body)); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async update(req: Request, res: Response): Promise<void> {
    try { ok(res, await serviceOrdersService.update(req.params.id, req.body)); }
    catch (e) { serverError(res, (e as Error).message); }
  },
};
