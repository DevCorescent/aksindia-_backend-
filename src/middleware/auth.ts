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

/**
 * Short-lived in-memory cache of profile rows, keyed by user id.
 *
 * `authenticate` runs on every protected request, and previously did a
 * `SELECT * FROM profiles` each time. On a dashboard load the frontend fires
 * ~12 requests at once, so that was ~12 redundant identical lookups competing
 * for the connection pool — the main driver of the "connection timeout" errors.
 * Caching for a few seconds removes that repeated load while keeping data fresh
 * enough (mutations call invalidateProfileCache to drop stale entries).
 */
const PROFILE_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 5000; // safety bound against unbounded growth

interface CachedProfile {
  profile: Record<string, unknown>;
  expires: number;
}

const profileCache = new Map<string, CachedProfile>();

/** Drop a user's cached profile (call after any update to their profile row). */
export function invalidateProfileCache(userId: string): void {
  profileCache.delete(userId);
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

  const now = Date.now();
  const cached = profileCache.get(payload.id);

  if (cached && cached.expires > now) {
    req.user = mapProfile(cached.profile);
    next();
    return;
  }

  let profile: Record<string, unknown> | null;
  try {
    profile = await queryOne('SELECT * FROM profiles WHERE id = $1 LIMIT 1', [payload.id]);
  } catch (err) {
    // DB unreachable / pool timeout during auth — surface it clearly instead of
    // an opaque 500, and log which request tripped it (db.ts logs the SQL/pool).
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[auth] profile lookup failed for user ${payload.id} on ${req.method} ${req.originalUrl}: ${message}`);
    res.status(503).json({ success: false, error: 'Service temporarily unavailable, please retry.' });
    return;
  }

  if (!profile) {
    // A deleted user must not keep authenticating from a stale cache entry.
    profileCache.delete(payload.id);
    unauthorized(res, 'Profile not found');
    return;
  }

  // Opportunistic bound: if the cache grows too large, clear it (cheap, rare).
  if (profileCache.size >= MAX_CACHE_ENTRIES) {
    profileCache.clear();
  }
  profileCache.set(payload.id, { profile, expires: now + PROFILE_TTL_MS });

  req.user = mapProfile(profile);
  next();
}
