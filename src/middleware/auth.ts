import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { queryOne } from '../config/db';
import { unauthorized } from '../utils/response';
import { mapProfile } from '../utils/mappers';

interface JwtPayload {
  id: string;
  role: string;
  email: string;
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    unauthorized(res);
    return;
  }

  const token = authHeader.slice(7);

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
  } catch {
    unauthorized(res, 'Invalid or expired token');
    return;
  }

  const profile = await queryOne('SELECT * FROM profiles WHERE id = $1 LIMIT 1', [payload.id]);
  if (!profile) {
    unauthorized(res, 'Profile not found');
    return;
  }

  req.user = mapProfile(profile);
  next();
}
