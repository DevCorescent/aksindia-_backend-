import type { Request, Response } from 'express';
import { ordersService, ITEM_UNAVAILABLE } from './orders.service';
import { orderHistoryService } from './order-history.service';
import { canAccessOrder, productTransitionError, pick } from './order-access';
import type { Order } from '../../types';
import { ok, created, badRequest, serverError, forbidden, notFound } from '../../utils/response';

// Fields a non-admin (store / delivery partner) may send on PATCH. Payment
// fields stay admin-only here; payment webhooks update them in-process.
const FULFILMENT_FIELDS = ['status', 'trackingNumber', 'courierName', 'cancelReason'] as const;

/**
 * Load an order the caller may access. Responds 404 (not 403) when the order
 * exists but belongs to someone else, so ids cannot be probed.
 */
async function loadAccessible(req: Request, res: Response): Promise<Order | null> {
  let order: Order;
  try {
    order = await ordersService.getById(req.params.id);
  } catch (e) {
    if ((e as Error).message === 'Order not found') { notFound(res, 'Order not found'); return null; }
    throw e;
  }
  if (!canAccessOrder(req.user!, order)) { notFound(res, 'Order not found'); return null; }
  return order;
}

export const ordersController = {
  async list(req: Request, res: Response): Promise<void> {
    try {
      ok(res, await ordersService.list(req.user!.role, req.user!.id, req.user!.storeId));
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const order = await loadAccessible(req, res);
      if (order) ok(res, order);
    } catch (e) { serverError(res, (e as Error).message); }
  },

  /** Order + its status timeline (from order_status_history) for tracking. */
  async tracking(req: Request, res: Response): Promise<void> {
    try {
      const order = await loadAccessible(req, res);
      if (!order) return;
      ok(res, { order, timeline: await orderHistoryService.timeline(order.id, 'product') });
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async create(req: Request, res: Response): Promise<void> {
    try {
      const body = { ...req.body } as Omit<Order, 'id'>;
      // A customer can only order for themselves, and every order starts pending
      // (a client-chosen 'delivered' would otherwise unlock reviews).
      if (req.user!.role === 'customer') {
        body.customerId = req.user!.id;
        body.status = 'pending';
      }
      const data = await ordersService.create(body);
      created(res, data);
    } catch (e) {
      const message = (e as Error).message;
      if (message === ITEM_UNAVAILABLE) { badRequest(res, message); return; }
      serverError(res, message);
    }
  },

  async update(req: Request, res: Response): Promise<void> {
    try {
      const role = req.user!.role;
      const current = await loadAccessible(req, res);
      if (!current) return;

      const patch: Partial<Order> = role === 'admin'
        ? req.body
        : pick(req.body as Partial<Order>, FULFILMENT_FIELDS);

      if (patch.status && patch.status !== current.status) {
        const error = productTransitionError(role, current.status, patch.status);
        if (error) { forbidden(res, error); return; }
      }
      ok(res, await ordersService.update(current.id, patch, req.user!.id));
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async cancel(req: Request, res: Response): Promise<void> {
    try {
      const { reason } = req.body as { reason?: string };
      if (!reason) { badRequest(res, 'reason is required'); return; }
      const role = req.user!.role;
      if (!['admin', 'customer', 'store_owner'].includes(role)) { forbidden(res); return; }
      const order = await loadAccessible(req, res);
      if (!order) return;
      if (role === 'store_owner') {
        const error = productTransitionError(role, order.status, 'cancelled');
        if (error) { forbidden(res, error); return; }
      }
      ok(res, await ordersService.cancel(order.id, reason, req.user!.id));
    } catch (e) {
      const message = (e as Error).message;
      if (message === 'Order not found or cannot be cancelled') { badRequest(res, message); return; }
      serverError(res, message);
    }
  },
};
