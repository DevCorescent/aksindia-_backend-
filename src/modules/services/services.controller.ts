import type { Request, Response } from 'express';
import { servicesService } from './services.service';
import { ok, created, noContent, badRequest, serverError } from '../../utils/response';

export const servicesController = {
  async list(req: Request, res: Response): Promise<void> {
    try {
      const filters = {
        category: req.query.category as string | undefined,
        city:     req.query.city     as string | undefined,
      };
      ok(res, await servicesService.list(req.user!.role, req.user!.id, filters));
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async listPublic(req: Request, res: Response): Promise<void> {
    try {
      const filters = {
        category: req.query.category as string | undefined,
        city:     req.query.city     as string | undefined,
        featured: req.query.featured === 'true' ? true : undefined,
      };
      ok(res, await servicesService.listPublic(filters));
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async featured(req: Request, res: Response): Promise<void> {
    try {
      ok(res, await servicesService.featured(req.query.city as string | undefined));
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async search(req: Request, res: Response): Promise<void> {
    try {
      const q = req.query.q as string;
      if (!q?.trim()) { badRequest(res, 'q query param required'); return; }
      ok(res, await servicesService.search(q.trim(), req.query.city as string | undefined));
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async getById(req: Request, res: Response): Promise<void> {
    try { ok(res, await servicesService.getById(req.params.id)); }
    catch (e) { serverError(res, (e as Error).message); }
  },

  async create(req: Request, res: Response): Promise<void> {
    try {
      if (!req.body.title) { badRequest(res, 'title is required'); return; }
      const data = await servicesService.create({
        ...req.body,
        providerId:   req.body.providerId   ?? req.user!.id,
        providerName: req.body.providerName ?? req.user!.name,
      });
      created(res, data);
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async approve(req: Request, res: Response): Promise<void> {
    try { ok(res, await servicesService.approve(req.params.id)); }
    catch (e) { serverError(res, (e as Error).message); }
  },

  async reject(req: Request, res: Response): Promise<void> {
    try {
      const { reason } = req.body as { reason?: string };
      if (!reason) { badRequest(res, 'reason is required'); return; }
      ok(res, await servicesService.reject(req.params.id, reason));
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async update(req: Request, res: Response): Promise<void> {
    try { ok(res, await servicesService.update(req.params.id, req.body)); }
    catch (e) { serverError(res, (e as Error).message); }
  },

  async remove(req: Request, res: Response): Promise<void> {
    try { await servicesService.remove(req.params.id); noContent(res); }
    catch (e) { serverError(res, (e as Error).message); }
  },
};
