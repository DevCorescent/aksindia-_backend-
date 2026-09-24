import type { Request, Response } from 'express';
import { serviceOrdersService } from './service-orders.service';
import { orderHistoryService } from '../orders/order-history.service';
import { canAccessServiceOrder, serviceTransitionError, pick } from '../orders/order-access';
import type { ServiceOrder } from '../../types';
import { ok, created, badRequest, forbidden, notFound, serverError } from '../../utils/response';

// Fields a service provider may send on PATCH (admin is unrestricted).
const PROVIDER_FIELDS = ['status', 'scheduledDate', 'notes'] as const;

/** Load a service order the caller may access; 404 otherwise (no id probing). */
async function loadAccessible(req: Request, res: Response): Promise<ServiceOrder | null> {
  let order: ServiceOrder;
  try {
    order = await serviceOrdersService.getById(req.params.id);
  } catch (e) {
    if ((e as Error).message === 'Service order not found') { notFound(res, 'Service order not found'); return null; }
    throw e;
  }
  if (!canAccessServiceOrder(req.user!, order)) { notFound(res, 'Service order not found'); return null; }
  return order;
}

export const serviceOrdersController = {
  async list(req: Request, res: Response): Promise<void> {
    try { ok(res, await serviceOrdersService.list(req.user!.role, req.user!.id)); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async getById(req: Request, res: Response): Promise<void> {
    try {
      const order = await loadAccessible(req, res);
      if (order) ok(res, order);
    } catch (e) { serverError(res, (e as Error).message); }
  },
  /** Service order + its status timeline for customer tracking. */
  async tracking(req: Request, res: Response): Promise<void> {
    try {
      const order = await loadAccessible(req, res);
      if (!order) return;
      ok(res, { order, timeline: await orderHistoryService.timeline(order.id, 'service') });
    } catch (e) { serverError(res, (e as Error).message); }
  },
  async create(req: Request, res: Response): Promise<void> {
    try {
      const body = { ...req.body } as Omit<ServiceOrder, 'id'>;
      if (req.user!.role === 'customer') body.customerId = req.user!.id;
      created(res, await serviceOrdersService.create(body));
    }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async complete(req: Request, res: Response): Promise<void> {
    try {
      const order = await loadAccessible(req, res);
      if (!order) return;
      ok(res, await serviceOrdersService.complete(order.id, req.user!.id));
    }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async cancel(req: Request, res: Response): Promise<void> {
    try {
      const { reason } = req.body as { reason?: string };
      if (!reason) { badRequest(res, 'reason is required'); return; }
      if (!['admin', 'customer', 'service_provider'].includes(req.user!.role)) { forbidden(res); return; }
      const order = await loadAccessible(req, res);
      if (!order) return;
      ok(res, await serviceOrdersService.cancel(order.id, reason, req.user!.id));
    } catch (e) { serverError(res, (e as Error).message); }
  },
  async reject(req: Request, res: Response): Promise<void> {
    try {
      const { reason } = req.body as { reason?: string };
      if (!reason) { badRequest(res, 'reason is required'); return; }
      const order = await loadAccessible(req, res);
      if (!order) return;
      ok(res, await serviceOrdersService.reject(order.id, reason, req.user!.id));
    } catch (e) { serverError(res, (e as Error).message); }
  },
  async update(req: Request, res: Response): Promise<void> {
    try {
      const role = req.user!.role;
      const current = await loadAccessible(req, res);
      if (!current) return;

      const patch: Partial<ServiceOrder> = role === 'admin'
        ? { ...req.body }
        : pick(req.body as Partial<ServiceOrder>, PROVIDER_FIELDS);

      if (patch.status === current.status) delete patch.status;
      if (patch.status) {
        const error = serviceTransitionError(role, current.status, patch.status);
        if (error) { forbidden(res, error); return; }
      }
      ok(res, await serviceOrdersService.update(current.id, patch, req.user!.id));
    }
    catch (e) { serverError(res, (e as Error).message); }
  },
};
