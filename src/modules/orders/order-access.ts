import type { Order, ServiceOrder, User } from '../../types';

/**
 * Single source of truth for who may see / change an order. Every order,
 * service-order and review endpoint goes through these, so an id in a URL is
 * never trusted on its own (IDOR).
 */

// Orders a delivery partner works on — must match ordersService.list.
export const DELIVERY_QUEUE_STATUSES: Order['status'][] = ['processing', 'shipped', 'delivered'];

export function canAccessOrder(user: User, order: Order): boolean {
  switch (user.role) {
    case 'admin':            return true;
    case 'customer':         return order.customerId === user.id;
    case 'store_owner':      return !!user.storeId && order.storeId === user.storeId;
    case 'agent':            return order.agentId === user.id;
    case 'delivery_partner': return DELIVERY_QUEUE_STATUSES.includes(order.status);
    default:                 return false;
  }
}

export function canAccessServiceOrder(user: User, order: ServiceOrder): boolean {
  switch (user.role) {
    case 'admin':            return true;
    case 'customer':         return order.customerId === user.id;
    case 'service_provider': return order.providerId === user.id;
    case 'agent':            return order.agentId === user.id;
    default:                 return false;
  }
}

type TransitionMap = Partial<Record<string, string[]>>;

/**
 * Allowed status moves per role (current → next). Admin is unrestricted.
 * Store: PENDING → ACCEPTED(processing) → DISPATCHED(shipped) → DELIVERED,
 * and may cancel before dispatch. Delivery partners keep their existing moves.
 */
const PRODUCT_TRANSITIONS: Record<string, TransitionMap> = {
  store_owner: {
    pending:    ['processing', 'cancelled'],
    processing: ['shipped', 'cancelled'],
    shipped:    ['delivered'],
  },
  delivery_partner: {
    processing: ['shipped'],
    shipped:    ['delivered'],
  },
};

// Service store: PENDING → CONFIRMED → IN_PROGRESS → COMPLETED (cancel until done).
const SERVICE_TRANSITIONS: Record<string, TransitionMap> = {
  service_provider: {
    pending:     ['confirmed', 'cancelled'],
    confirmed:   ['in_progress', 'cancelled'],
    in_progress: ['completed', 'cancelled'],
  },
};

function check(map: Record<string, TransitionMap>, role: string, from: string, to: string): string | null {
  if (role === 'admin') return null;
  const allowed = map[role]?.[from] ?? [];
  if (allowed.includes(to)) return null;
  return `Cannot change order status from "${from}" to "${to}".`;
}

/** Returns an error message when `role` may not move a product order `from` → `to`. */
export function productTransitionError(role: string, from: string, to: string): string | null {
  return check(PRODUCT_TRANSITIONS, role, from, to);
}

/** Returns an error message when `role` may not move a service order `from` → `to`. */
export function serviceTransitionError(role: string, from: string, to: string): string | null {
  return check(SERVICE_TRANSITIONS, role, from, to);
}

/** Keep only the listed keys of a request body (drops everything else). */
export function pick<T extends object>(body: T, keys: readonly string[]): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if ((body as Record<string, unknown>)[k] !== undefined) out[k] = (body as Record<string, unknown>)[k];
  }
  return out as Partial<T>;
}
