import type { Request, Response } from 'express';
import { servicesService } from './services.service';
import { ok, created, noContent, badRequest, serverError } from '../../utils/response';

export const servicesController = {
  async list(req: Request, res: Response): Promise<void> {
    try {
      const data = await servicesService.list(req.user!.role, req.user!.id);
      ok(res, data);
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const data = await servicesService.getById(req.params.id);
      ok(res, data);
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async create(req: Request, res: Response): Promise<void> {
    try {
      if (!req.body.title) { badRequest(res, 'title is required'); return; }
      const data = await servicesService.create({ ...req.body, providerId: req.body.providerId ?? req.user!.id, providerName: req.body.providerName ?? req.user!.name });
      created(res, data);
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async update(req: Request, res: Response): Promise<void> {
    try {
      const data = await servicesService.update(req.params.id, req.body);
      ok(res, data);
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async remove(req: Request, res: Response): Promise<void> {
    try {
      await servicesService.remove(req.params.id);
      noContent(res);
    } catch (e) { serverError(res, (e as Error).message); }
  },
};
