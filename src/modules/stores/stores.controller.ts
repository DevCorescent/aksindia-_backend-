import type { Request, Response } from 'express';
import { storesService } from './stores.service';
import { ok, created, badRequest, serverError } from '../../utils/response';

export const storesController = {
  async list(_req: Request, res: Response): Promise<void> {
    try { ok(res, await storesService.list()); }
    catch (e) { serverError(res, (e as Error).message); }
  },

  async getById(req: Request, res: Response): Promise<void> {
    try { ok(res, await storesService.getById(req.params.id)); }
    catch (e) { serverError(res, (e as Error).message); }
  },

  async getBySlug(req: Request, res: Response): Promise<void> {
    try { ok(res, await storesService.getBySlug(req.params.slug)); }
    catch (e) { serverError(res, (e as Error).message); }
  },

  async create(req: Request, res: Response): Promise<void> {
    try {
      if (!req.body.name || !req.body.slug) { badRequest(res, 'name and slug required'); return; }
      const data = await storesService.create({ ...req.body, ownerId: req.body.ownerId ?? req.user!.id, ownerName: req.body.ownerName ?? req.user!.name });
      created(res, data);
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async update(req: Request, res: Response): Promise<void> {
    try { ok(res, await storesService.update(req.params.id, req.body)); }
    catch (e) { serverError(res, (e as Error).message); }
  },
};
