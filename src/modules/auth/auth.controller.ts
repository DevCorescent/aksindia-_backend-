import type { Request, Response } from 'express';
import { authService } from './auth.service';
import { ok, created, badRequest, unauthorized, serverError } from '../../utils/response';

const ALLOWED_ROLES = ['admin', 'store_owner', 'service_provider', 'customer', 'agent'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const authController = {
  async signIn(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) { badRequest(res, 'email and password required'); return; }
      const result = await authService.signIn(email, password);
      ok(res, result);
    } catch (e) {
      const message = (e as Error).message;
      if (message === 'Invalid email or password') { unauthorized(res, message); return; }
      serverError(res, message);
    }
  },

  async signUp(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, name, role, phone, city, state } = req.body as Record<string, string>;
      if (!email || !password || !name || !role) { badRequest(res, 'email, password, name and role required'); return; }
      if (!EMAIL_RE.test(email)) { badRequest(res, 'a valid email is required'); return; }
      if (password.length < 6) { badRequest(res, 'password must be at least 6 characters'); return; }
      if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
        badRequest(res, `role must be one of: ${ALLOWED_ROLES.join(', ')}`); return;
      }
      const result = await authService.signUp({ email, password, name, role: role as never, phone, city, state });
      created(res, result);
    } catch (e) {
      const message = (e as Error).message;
      if (message === 'Email already registered') { badRequest(res, message); return; }
      serverError(res, message);
    }
  },

  async refresh(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body as { refreshToken?: string };
      if (!refreshToken) { badRequest(res, 'refreshToken required'); return; }
      const tokens = await authService.refresh(refreshToken);
      ok(res, tokens);
    } catch (e) {
      unauthorized(res, (e as Error).message);
    }
  },

  async signOut(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body as { refreshToken?: string };
      if (refreshToken) await authService.signOut(refreshToken);
      ok(res, { message: 'Signed out' });
    } catch (e) {
      serverError(res, (e as Error).message);
    }
  },

  async me(req: Request, res: Response): Promise<void> {
    try { ok(res, req.user); }
    catch (e) { serverError(res, (e as Error).message); }
  },

  async updateMe(req: Request, res: Response): Promise<void> {
    try {
      await authService.updateProfile(req.user!.id, req.body);
      const updated = await authService.getProfile(req.user!.id);
      ok(res, updated);
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
      if (!currentPassword || !newPassword) { badRequest(res, 'currentPassword and newPassword required'); return; }
      await authService.changePassword(req.user!.id, currentPassword, newPassword);
      ok(res, { message: 'Password changed. Please sign in again on other devices.' });
    } catch (e) {
      const message = (e as Error).message;
      if (message === 'Current password is incorrect') { badRequest(res, message); return; }
      serverError(res, message);
    }
  },

  async sessions(req: Request, res: Response): Promise<void> {
    try { ok(res, await authService.listSessions(req.user!.id)); }
    catch (e) { serverError(res, (e as Error).message); }
  },

  async revokeSession(req: Request, res: Response): Promise<void> {
    try {
      await authService.revokeSession(req.params.sessionId, req.user!.id);
      ok(res, { message: 'Session revoked' });
    } catch (e) { serverError(res, (e as Error).message); }
  },
};
