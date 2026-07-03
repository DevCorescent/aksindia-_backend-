import type { Request, Response, NextFunction } from 'express';
import type { UserRole } from '../types';
import { forbidden } from '../utils/response';

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      forbidden(res);
      return;
    }
    next();
  };
}
