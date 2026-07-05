import type { Request, Response } from 'express';
import { agentsService } from './agents.service';
import { ok, created, serverError } from '../../utils/response';

export const agentsController = {
  async list(req: Request, res: Response): Promise<void> {
    try { ok(res, await agentsService.list(req.query.status as string | undefined)); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async getById(req: Request, res: Response): Promise<void> {
    try { ok(res, await agentsService.getById(req.params.id)); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async getByCode(req: Request, res: Response): Promise<void> {
    try { ok(res, await agentsService.getByCode(req.params.code)); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async create(req: Request, res: Response): Promise<void> {
    try {
      await agentsService.create(req.body.agentId ?? req.user!.id, req.body);
      created(res, { message: 'Agent created' });
    } catch (e) { serverError(res, (e as Error).message); }
  },
  async approve(req: Request, res: Response): Promise<void> {
    try { ok(res, await agentsService.approve(req.params.id, req.user!.id)); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async reject(req: Request, res: Response): Promise<void> {
    try { ok(res, await agentsService.reject(req.params.id)); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async earnings(req: Request, res: Response): Promise<void> {
    try { ok(res, await agentsService.getEarnings(req.params.id)); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async update(req: Request, res: Response): Promise<void> {
    try { ok(res, await agentsService.update(req.params.id, req.body)); }
    catch (e) { serverError(res, (e as Error).message); }
  },
};
