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
  async revenueTrend(req: Request, res: Response): Promise<void> {
    try {
      const days = Number(req.query.days) || 30;
      ok(res, await analyticsService.getRevenueTrend(days));
    } catch (e) { serverError(res, (e as Error).message); }
  },
  async topProducts(req: Request, res: Response): Promise<void> {
    try {
      const limit = Number(req.query.limit) || 10;
      ok(res, await analyticsService.getTopProducts(limit));
    } catch (e) { serverError(res, (e as Error).message); }
  },
  async eventSummary(_req: Request, res: Response): Promise<void> {
    try { ok(res, await analyticsService.getEventSummary()); }
    catch (e) { serverError(res, (e as Error).message); }
  },
};
