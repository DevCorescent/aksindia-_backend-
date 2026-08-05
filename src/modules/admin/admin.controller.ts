import type { Request, Response } from 'express';
import { adminService } from './admin.service';
import { ok, created, badRequest, noContent, serverError } from '../../utils/response';

export const adminController = {
  async listUsers(_req: Request, res: Response): Promise<void> {
    try { ok(res, await adminService.listUsers()); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async updateUser(req: Request, res: Response): Promise<void> {
    try { ok(res, await adminService.updateUser(req.params.id, req.body)); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async deleteUser(req: Request, res: Response): Promise<void> {
    try { await adminService.deleteUser(req.params.id); noContent(res); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async resetUserPassword(req: Request, res: Response): Promise<void> {
    try {
      const { newPassword } = req.body as { newPassword?: string };
      if (!newPassword) { badRequest(res, 'newPassword required'); return; }
      await adminService.resetUserPassword(req.params.id, newPassword);
      ok(res, { message: 'Password updated. The user must sign in again.' });
    } catch (e) {
      const message = (e as Error).message;
      if (message === 'User not found') { badRequest(res, message); return; }
      if (message === 'Password must be at least 6 characters') { badRequest(res, message); return; }
      serverError(res, message);
    }
  },
  async listRoles(_req: Request, res: Response): Promise<void> {
    try { ok(res, await adminService.listCustomRoles()); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async createRole(req: Request, res: Response): Promise<void> {
    try { created(res, await adminService.createRole(req.body)); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async updateRole(req: Request, res: Response): Promise<void> {
    try { ok(res, await adminService.updateRole(req.params.id, req.body)); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async deleteRole(req: Request, res: Response): Promise<void> {
    try { await adminService.deleteRole(req.params.id); noContent(res); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async revenue(_req: Request, res: Response): Promise<void> {
    try { ok(res, await adminService.getRevenueSummary()); }
    catch (e) { serverError(res, (e as Error).message); }
  },
  async dashboardStats(_req: Request, res: Response): Promise<void> {
    try { ok(res, await adminService.getDashboardStats()); }
    catch (e) { serverError(res, (e as Error).message); }
  },
};
