import type { Request, Response } from 'express';
import { notificationsService } from './notifications.service';
import { ok, created, noContent, serverError } from '../../utils/response';

export const notificationsController = {
  async list(req: Request, res: Response): Promise<void> {
    try { ok(res, await notificationsService.list(req.user!.id)); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async countUnread(req: Request, res: Response): Promise<void> {
    try { ok(res, { count: await notificationsService.countUnread(req.user!.id) }); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async create(req: Request, res: Response): Promise<void> {
    try {
      await notificationsService.create(req.body.userId, req.body);
      created(res, { message: 'Notification sent' });
    } catch (e) { serverError(res, (e as Error).message); }
  },
  async broadcast(req: Request, res: Response): Promise<void> {
    try {
      await notificationsService.broadcast(req.body);
      created(res, { message: 'Broadcast sent to all users' });
    } catch (e) { serverError(res, (e as Error).message); }
  },
  async markRead(req: Request, res: Response): Promise<void> {
    try { await notificationsService.markRead(req.params.id); ok(res, { message: 'Marked read' }); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async markAllRead(req: Request, res: Response): Promise<void> {
    try { await notificationsService.markAllRead(req.user!.id); ok(res, { message: 'All marked read' }); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async remove(req: Request, res: Response): Promise<void> {
    try { await notificationsService.remove(req.params.id); noContent(res); }
    catch (e) { serverError(res, (e as Error).message); }
  },
};
