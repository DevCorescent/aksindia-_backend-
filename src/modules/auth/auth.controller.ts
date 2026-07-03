import type { Request, Response } from 'express';
import { authService } from './auth.service';
import { ok, created, badRequest, serverError } from '../../utils/response';

export const authController = {
  async signIn(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) { badRequest(res, 'email and password required'); return; }
      const result = await authService.signIn(email, password);
      ok(res, result);
    } catch (e) {
      serverError(res, (e as Error).message);
    }
  },

  async signUp(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, name, role, phone, city, state } = req.body as Record<string, string>;
      if (!email || !password || !name || !role) { badRequest(res, 'email, password, name and role required'); return; }
      const result = await authService.signUp({ email, password, name, role: role as never, phone, city, state });
      created(res, result);
    } catch (e) {
      serverError(res, (e as Error).message);
    }
  },

  async me(req: Request, res: Response): Promise<void> {
    try {
      ok(res, req.user);
    } catch (e) {
      serverError(res, (e as Error).message);
    }
  },

  async updateMe(req: Request, res: Response): Promise<void> {
    try {
      await authService.updateProfile(req.user!.id, req.body);
      const updated = await authService.getProfile(req.user!.id);
      ok(res, updated);
    } catch (e) {
      serverError(res, (e as Error).message);
    }
  },
};
