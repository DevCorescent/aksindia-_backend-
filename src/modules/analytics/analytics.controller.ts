import type { Request, Response } from 'express';
import { analyticsService } from './analytics.service';
import { ok, created, serverError } from '../../utils/response';

export const analyticsController = {
  async activities(_req: Request, res: Response): Promise<void> {
    try { ok(res, await analyticsService.getActivities()); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async abandonedCarts(_req: Request, res: Response): Promise<void> {
    try { ok(res, await analyticsService.getAbandonedCarts()); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async track(req: Request, res: Response): Promise<void> {
    try {
      await analyticsService.trackActivity(req.body);
      created(res, { message: 'Tracked' });
    } catch (e) { serverError(res, (e as Error).message); }
  },
};
