import type { Request, Response } from 'express';
import { storesService, STORE_HAS_OWNER, SLUG_TAKEN, type StoreOwnerAccount } from './stores.service';
import { pick } from '../orders/order-access';
import type { Store } from '../../types';
import { ok, created, badRequest, forbidden, notFound, serverError } from '../../utils/response';
import { MIN_PASSWORD_LENGTH, PASSWORD_TOO_SHORT, USERNAME_RE, INVALID_USERNAME } from '../../config/constants';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Store profile fields a store owner may edit on their own store. Status,
// commission, wallet and activation fields stay admin-only.
const OWNER_EDITABLE_FIELDS = [
  'name', 'tagline', 'description', 'logo', 'themeColor', 'city', 'state',
  'contactEmail', 'contactPhone', 'gstNumber', 'bankAccount', 'bankIfsc',
  'invoiceSettings', 'customization',
] as const;

// Business errors from the account flows that are the caller's fault (400).
const ACCOUNT_ERRORS = ['Email already registered', 'User ID already taken', SLUG_TAKEN, STORE_HAS_OWNER];

/** Validate an admin-supplied store login; returns an error message or null. */
function accountError(a: Partial<StoreOwnerAccount> | undefined): string | null {
  if (!a?.name?.trim() || !a.email || !a.username || !a.password) {
    return 'Store login needs name, email, User ID and password';
  }
  if (!EMAIL_RE.test(a.email)) return 'a valid email is required';
  if (!USERNAME_RE.test(a.username)) return INVALID_USERNAME;
  if (a.password.length < MIN_PASSWORD_LENGTH) return PASSWORD_TOO_SHORT;
  return null;
}

export const storesController = {
  async list(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = req.user!.role === 'store_owner' ? req.user!.id : undefined;
      ok(res, await storesService.list(req.query.status as string | undefined, ownerId));
    }
    catch (e) { serverError(res, (e as Error).message); }
  },

  async listPublic(req: Request, res: Response): Promise<void> {
    try { ok(res, await storesService.listPublic(req.query.city as string | undefined)); }
    catch (e) { serverError(res, (e as Error).message); }
  },

  async getById(req: Request, res: Response): Promise<void> {
    try { ok(res, await storesService.getById(req.params.id)); }
    catch (e) { serverError(res, (e as Error).message); }
  },

  async getBySlug(req: Request, res: Response): Promise<void> {
    try { ok(res, await storesService.getBySlug(req.params.slug)); }
    catch (e) { serverError(res, (e as Error).message); }
  },

  async getProducts(req: Request, res: Response): Promise<void> {
    try { ok(res, await storesService.getStoreProducts(req.params.id)); }
    catch (e) { serverError(res, (e as Error).message); }
  },

  async create(req: Request, res: Response): Promise<void> {
    try {
      if (!req.body.name || !req.body.slug) { badRequest(res, 'name and slug required'); return; }
      const { ownerAccount, ...body } = req.body as Store & { ownerAccount?: StoreOwnerAccount };

      if (req.user!.role !== 'admin') {
        // Self-registration: a store owner can only create their own, pending store.
        created(res, await storesService.create({
          ...body, ownerId: req.user!.id, ownerName: body.ownerName || req.user!.name, status: 'pending',
        }));
        return;
      }

      if (ownerAccount) {
        const error = accountError(ownerAccount);
        if (error) { badRequest(res, error); return; }
        created(res, await storesService.createWithOwnerAccount(body, ownerAccount));
        return;
      }

      // `||` not `??`: the admin create-store form submits ownerId: '' when no
      // owner is selected, and '' is not nullish — so `??` passed it straight
      // through to owner_id (UUID NOT NULL) and the insert died with
      // `invalid input syntax for type uuid: ""`.
      const data = await storesService.create({
        ...body,
        ownerId:   body.ownerId   || req.user!.id,
        ownerName: body.ownerName || req.user!.name,
      });
      created(res, data);
    } catch (e) {
      const message = (e as Error).message;
      if (ACCOUNT_ERRORS.includes(message)) { badRequest(res, message); return; }
      serverError(res, message);
    }
  },

  /** Admin: give an existing admin-owned store its own login. */
  async createOwnerAccount(req: Request, res: Response): Promise<void> {
    try {
      const account = req.body as StoreOwnerAccount;
      const error = accountError(account);
      if (error) { badRequest(res, error); return; }
      ok(res, await storesService.assignOwnerAccount(req.params.id, account));
    } catch (e) {
      const message = (e as Error).message;
      if (message === 'Store not found') { notFound(res, message); return; }
      if (ACCOUNT_ERRORS.includes(message)) { badRequest(res, message); return; }
      serverError(res, message);
    }
  },

  async activate(req: Request, res: Response): Promise<void> {
    try { ok(res, await storesService.activate(req.params.id, req.user!.id)); }
    catch (e) { serverError(res, (e as Error).message); }
  },

  async reject(req: Request, res: Response): Promise<void> {
    try {
      const { reason } = req.body as { reason?: string };
      if (!reason) { badRequest(res, 'reason is required'); return; }
      ok(res, await storesService.reject(req.params.id, reason, req.user!.id));
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async update(req: Request, res: Response): Promise<void> {
    try {
      if (req.user!.role === 'admin') { ok(res, await storesService.update(req.params.id, req.body)); return; }
      // Store owners may only edit their own store, and only its profile fields.
      const store = await storesService.getById(req.params.id);
      if (store.ownerId !== req.user!.id) { forbidden(res, 'You can only edit your own store'); return; }
      ok(res, await storesService.update(store.id, pick(req.body as Partial<Store>, OWNER_EDITABLE_FIELDS)));
    } catch (e) {
      const message = (e as Error).message;
      if (message === 'Store not found') { notFound(res, message); return; }
      serverError(res, message);
    }
  },
};
