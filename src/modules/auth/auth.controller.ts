import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { authService, NOT_STORE_OWNER, OTP_DISABLED, INVALID_OTP, INVALID_CREDENTIALS, ACCOUNT_DEACTIVATED } from './auth.service';
import { ok, created, badRequest, unauthorized, forbidden, notFound, serverError } from '../../utils/response';
import { MIN_PASSWORD_LENGTH, PASSWORD_TOO_SHORT } from '../../config/constants';

const ALLOWED_ROLES = ['admin', 'store_owner', 'service_provider', 'customer', 'agent', 'delivery_partner'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Roles anyone may self-register with. The rest (admin, agent, delivery
// partner) are created from the admin panel, which sends the admin's token.
const SELF_SIGNUP_ROLES = ['customer', 'store_owner', 'service_provider'];

/** True when the request carries a valid access token of an admin account. */
async function isAdminCaller(req: Request): Promise<boolean> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return false;
  try {
    const { id } = jwt.verify(header.slice(7), env.jwtSecret) as { id: string };
    return (await authService.getProfile(id)).role === 'admin';
  } catch {
    return false;
  }
}

export const authController = {
  async signIn(req: Request, res: Response): Promise<void> {
    try {
      // `email` may also carry a store User ID; `identifier` is accepted as an alias.
      // Only non-empty strings count: anything else is a bad request, never a 500.
      const body = (req.body ?? {}) as Record<string, unknown>;
      const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
      const login = text(body.identifier) || text(body.email);
      const password = typeof body.password === 'string' ? body.password : '';
      if (!login || !password) { badRequest(res, 'email (or User ID) and password required'); return; }
      const result = await authService.signIn(login, password);
      ok(res, result);
    } catch (e) {
      const message = (e as Error).message;
      if (message === INVALID_CREDENTIALS) { unauthorized(res, message); return; }
      if (message === ACCOUNT_DEACTIVATED) { forbidden(res, message); return; }
      // Anything else is a server fault (e.g. a DB error) — log the cause, but
      // never show SQL to the login screen.
      console.error('[auth] sign-in failed:', message);
      serverError(res, 'Sign-in failed due to a server error. Please try again.');
    }
  },

  async signUp(req: Request, res: Response): Promise<void> {
    try {
      const {
        email, password, name, role, phone, city, state,
        dateOfBirth, gender, addressLine1, addressLine2, landmark, pinCode,
      } = req.body as Record<string, string>;
      if (!email || !password || !name || !role) { badRequest(res, 'email, password, name and role required'); return; }
      if (!EMAIL_RE.test(email)) { badRequest(res, 'a valid email is required'); return; }
      if (password.length < MIN_PASSWORD_LENGTH) { badRequest(res, PASSWORD_TOO_SHORT); return; }
      if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
        badRequest(res, `role must be one of: ${ALLOWED_ROLES.join(', ')}`); return;
      }
      if (!SELF_SIGNUP_ROLES.includes(role) && !(await isAdminCaller(req))) {
        forbidden(res, `Only an admin can create ${role} accounts`); return;
      }
      const result = await authService.signUp({
        email, password, name, role: role as never, phone, city, state,
        dateOfBirth, gender, addressLine1, addressLine2, landmark, pinCode,
      });
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
    } catch (e) {
      const message = (e as Error).message;
      if (message === NOT_STORE_OWNER) { forbidden(res, message); return; }
      serverError(res, message);
    }
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

  async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body as { email?: string };
      if (!email) { badRequest(res, 'email required'); return; }
      ok(res, await authService.forgotPassword(email));
    } catch (e) { serverError(res, (e as Error).message); }
  },

  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const { token, newPassword } = req.body as { token?: string; newPassword?: string };
      if (!token || !newPassword) { badRequest(res, 'token and newPassword required'); return; }
      await authService.resetPassword(token, newPassword);
      ok(res, { message: 'Password has been reset. You can now sign in with your new password.' });
    } catch (e) {
      const message = (e as Error).message;
      if (message === 'Invalid or expired reset token') { badRequest(res, message); return; }
      if (message === PASSWORD_TOO_SHORT) { badRequest(res, message); return; }
      serverError(res, message);
    }
  },

  // ── Email-OTP recovery (feature-gated; 404 while disabled) ─────────────────

  recoveryOptions(_req: Request, res: Response): void {
    ok(res, authService.recoveryOptions());
  },

  async requestPasswordOtp(req: Request, res: Response): Promise<void> {
    try {
      const { identifier } = req.body as { identifier?: string };
      if (!identifier) { badRequest(res, 'identifier (email or User ID) required'); return; }
      ok(res, await authService.requestPasswordOtp(identifier));
    } catch (e) {
      const message = (e as Error).message;
      if (message === OTP_DISABLED) { notFound(res, message); return; }
      serverError(res, message);
    }
  },

  async verifyPasswordOtp(req: Request, res: Response): Promise<void> {
    try {
      const { identifier, otp } = req.body as { identifier?: string; otp?: string };
      if (!identifier || !otp) { badRequest(res, 'identifier and otp required'); return; }
      ok(res, await authService.verifyPasswordOtp(identifier, otp));
    } catch (e) {
      const message = (e as Error).message;
      if (message === OTP_DISABLED) { notFound(res, message); return; }
      if (message === INVALID_OTP)  { badRequest(res, message); return; }
      serverError(res, message);
    }
  },

  async forgotUsername(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body as { email?: string };
      if (!email || !EMAIL_RE.test(email)) { badRequest(res, 'a valid email is required'); return; }
      ok(res, await authService.forgotUsername(email));
    } catch (e) {
      const message = (e as Error).message;
      if (message === OTP_DISABLED) { notFound(res, message); return; }
      serverError(res, message);
    }
  },
};
