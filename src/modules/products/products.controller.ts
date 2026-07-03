import type { Request, Response } from 'express';
import { productsService } from './products.service';
import { ok, created, noContent, badRequest, serverError } from '../../utils/response';

export const productsController = {
  async list(req: Request, res: Response): Promise<void> {
    try {
      const role = req.user!.role;
      const storeId = req.user!.storeId ?? (req.query.storeId as string | undefined);
      const data = await productsService.list(role, storeId);
      ok(res, data);
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const data = await productsService.getById(req.params.id);
      ok(res, data);
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async create(req: Request, res: Response): Promise<void> {
    try {
      if (!req.body.name) { badRequest(res, 'name is required'); return; }
      const data = await productsService.create({ ...req.body, storeId: req.body.storeId ?? req.user!.storeId });
      created(res, data);
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async update(req: Request, res: Response): Promise<void> {
    try {
      const data = await productsService.update(req.params.id, req.body);
      ok(res, data);
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async remove(req: Request, res: Response): Promise<void> {
    try {
      await productsService.remove(req.params.id);
      noContent(res);
    } catch (e) { serverError(res, (e as Error).message); }
  },
};
