import type { Request, Response } from 'express';
import { productsService } from './products.service';
import { ok, created, noContent, badRequest, serverError } from '../../utils/response';

export const productsController = {
  async list(req: Request, res: Response): Promise<void> {
    try {
      const role = req.user!.role;
      const storeId = req.user!.storeId ?? (req.query.storeId as string | undefined);
      const filters = {
        category: req.query.category as string | undefined,
        city:     req.query.city     as string | undefined,
        featured: req.query.featured === 'true' ? true : undefined,
      };
      ok(res, await productsService.list(role, storeId, filters));
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async listPublic(req: Request, res: Response): Promise<void> {
    try {
      const filters = {
        category: req.query.category as string | undefined,
        city:     req.query.city     as string | undefined,
        featured: req.query.featured === 'true' ? true : undefined,
        storeId:  req.query.storeId  as string | undefined,
      };
      ok(res, await productsService.listPublic(filters));
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async featured(req: Request, res: Response): Promise<void> {
    try {
      ok(res, await productsService.featured(req.query.city as string | undefined));
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async search(req: Request, res: Response): Promise<void> {
    try {
      const q = req.query.q as string;
      if (!q?.trim()) { badRequest(res, 'q query param required'); return; }
      ok(res, await productsService.search(q.trim(), req.query.city as string | undefined));
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async getById(req: Request, res: Response): Promise<void> {
    try { ok(res, await productsService.getById(req.params.id)); }
    catch (e) { serverError(res, (e as Error).message); }
  },

  async create(req: Request, res: Response): Promise<void> {
    try {
      if (!req.body.name) { badRequest(res, 'name is required'); return; }
      const data = await productsService.create({ ...req.body, storeId: req.body.storeId ?? req.user!.storeId });
      created(res, data);
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async update(req: Request, res: Response): Promise<void> {
    try { ok(res, await productsService.update(req.params.id, req.body)); }
    catch (e) { serverError(res, (e as Error).message); }
  },

  async remove(req: Request, res: Response): Promise<void> {
    try { await productsService.remove(req.params.id); noContent(res); }
    catch (e) { serverError(res, (e as Error).message); }
  },
};
