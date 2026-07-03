import type { Request, Response } from 'express';
import { homepageService } from './homepage.service';
import { ok, serverError } from '../../utils/response';

export const homepageController = {
  async get(_req: Request, res: Response): Promise<void> {
    try { ok(res, await homepageService.get()); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async update(req: Request, res: Response): Promise<void> {
    try { ok(res, await homepageService.update(req.body)); }
    catch (e) { serverError(res, (e as Error).message); }
  },
};
