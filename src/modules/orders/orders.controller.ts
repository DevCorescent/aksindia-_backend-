import type { Request, Response } from 'express';
import { ordersService } from './orders.service';
import { ok, created, badRequest, serverError, forbidden } from '../../utils/response';

// Which order statuses each role is allowed to set. Admin is unrestricted.
const ALLOWED_STATUS: Record<string, string[]> = {
  store_owner:      ['processing', 'cancelled'],
  delivery_partner: ['shipped', 'delivered'],
};

export const ordersController = {
  async list(req: Request, res: Response): Promise<void> {
    try {
      ok(res, await ordersService.list(req.user!.role, req.user!.id, req.user!.storeId));
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async getById(req: Request, res: Response): Promise<void> {
    try { ok(res, await ordersService.getById(req.params.id)); }
    catch (e) { serverError(res, (e as Error).message); }
  },

  async create(req: Request, res: Response): Promise<void> {
    try {
      const data = await ordersService.create(req.body);
      created(res, data);
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async update(req: Request, res: Response): Promise<void> {
    try {
      const role = req.user!.role;
      const nextStatus = (req.body as { status?: string }).status;
      // Enforce role-scoped status transitions (admin is unrestricted).
      if (nextStatus && role !== 'admin') {
        const allowed = ALLOWED_STATUS[role] ?? [];
        if (!allowed.includes(nextStatus)) {
          forbidden(res, `A ${role.replace('_', ' ')} cannot set an order to "${nextStatus}".`);
          return;
        }
      }
      ok(res, await ordersService.update(req.params.id, req.body));
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async cancel(req: Request, res: Response): Promise<void> {
    try {
      const { reason } = req.body as { reason?: string };
      if (!reason) { badRequest(res, 'reason is required'); return; }
      ok(res, await ordersService.cancel(req.params.id, reason));
    } catch (e) { serverError(res, (e as Error).message); }
  },
};
