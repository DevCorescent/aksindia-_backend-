import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { query, queryOne, execute } from '../../config/db';
import { env } from '../../config/env';
import type { User, UserRole } from '../../types';
import { mapProfile } from '../../utils/mappers';

function signAccess(id: string, role: string, email: string): string {
  return jwt.sign({ id, role, email }, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

function signRefresh(id: string): string {
  return jwt.sign({ id, type: 'refresh' }, env.jwtSecret, { expiresIn: env.refreshJwtExpiresIn } as jwt.SignOptions);
}

export const authService = {
  async signIn(email: string, password: string): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const row = await queryOne<Record<string, unknown>>(
      'SELECT * FROM profiles WHERE email = $1 LIMIT 1',
      [email.toLowerCase().trim()],
    );
    if (!row) throw new Error('Invalid email or password');

    const valid = await bcrypt.compare(password, row.password_hash as string);
    if (!valid) throw new Error('Invalid email or password');

    const user = mapProfile(row);
    const accessToken  = signAccess(user.id, user.role, user.email);
    const refreshToken = signRefresh(user.id);

    await execute('INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)', [user.id, refreshToken]);
    // Keep last 5 sessions per user (multi-device)
    await execute(
      `DELETE FROM refresh_tokens WHERE user_id = $1 AND id NOT IN (
         SELECT id FROM refresh_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5
       )`,
      [user.id],
    );

    return { user, accessToken, refreshToken };
  },

  async refresh(token: string): Promise<{ accessToken: string; refreshToken: string }> {
    let payload: { id: string; type?: string };
    try {
      payload = jwt.verify(token, env.jwtSecret) as { id: string; type: string };
    } catch {
      throw new Error('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh') throw new Error('Invalid token type');

    const stored = await queryOne<{ id: string }>(
      'SELECT id FROM refresh_tokens WHERE user_id = $1 AND token = $2',
      [payload.id, token],
    );
    if (!stored) throw new Error('Refresh token revoked or not found');

    const profile = await queryOne('SELECT * FROM profiles WHERE id = $1', [payload.id]);
    if (!profile) throw new Error('User not found');
    const user = mapProfile(profile);

    // Rotate tokens
    await execute('DELETE FROM refresh_tokens WHERE token = $1', [token]);
    const newAccess  = signAccess(user.id, user.role, user.email);
    const newRefresh = signRefresh(user.id);
    await execute('INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)', [user.id, newRefresh]);

    return { accessToken: newAccess, refreshToken: newRefresh };
  },

  async signOut(token: string): Promise<void> {
    await execute('DELETE FROM refresh_tokens WHERE token = $1', [token]);
  },

  async signUp(opts: {
    email: string;
    password: string;
    name: string;
    role: UserRole;
    phone?: string;
    city?: string;
    state?: string;
  }): Promise<{ userId: string }> {
    const existing = await queryOne('SELECT id FROM profiles WHERE email = $1', [opts.email.toLowerCase().trim()]);
    if (existing) throw new Error('Email already registered');

    const passwordHash = await bcrypt.hash(opts.password, 12);
    const userId = randomUUID();

    await execute(
      `INSERT INTO profiles (id, name, email, password_hash, role, phone, city, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, opts.name, opts.email.toLowerCase().trim(), passwordHash, opts.role,
       opts.phone ?? null, opts.city ?? null, opts.state ?? null],
    );
    await execute('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);

    return { userId };
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const row = await queryOne<{ password_hash: string }>(
      'SELECT password_hash FROM profiles WHERE id = $1',
      [userId],
    );
    if (!row) throw new Error('User not found');

    const valid = await bcrypt.compare(currentPassword, row.password_hash);
    if (!valid) throw new Error('Current password is incorrect');
    if (newPassword.length < 6) throw new Error('New password must be at least 6 characters');

    const newHash = await bcrypt.hash(newPassword, 12);
    await execute('UPDATE profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, userId]);
    // Revoke all sessions — other devices must re-login
    await execute('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
  },

  async getProfile(userId: string): Promise<User> {
    const row = await queryOne('SELECT * FROM profiles WHERE id = $1', [userId]);
    if (!row) throw new Error('Profile not found');
    return mapProfile(row);
  },

  async updateProfile(userId: string, patch: Partial<User>): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (patch.name    !== undefined) { fields.push(`name = $${idx++}`);       values.push(patch.name); }
    if (patch.phone   !== undefined) { fields.push(`phone = $${idx++}`);      values.push(patch.phone); }
    if (patch.city    !== undefined) { fields.push(`city = $${idx++}`);       values.push(patch.city); }
    if (patch.state   !== undefined) { fields.push(`state = $${idx++}`);      values.push(patch.state); }
    if (patch.avatar  !== undefined) { fields.push(`avatar_url = $${idx++}`); values.push(patch.avatar); }
    if (patch.storeId !== undefined) { fields.push(`store_id = $${idx++}`);   values.push(patch.storeId); }

    if (fields.length === 0) return;
    values.push(userId);
    await execute(`UPDATE profiles SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx}`, values);
  },

  async listSessions(userId: string): Promise<{ id: string; createdAt: string }[]> {
    const rows = await query<{ id: string; created_at: Date }>(
      'SELECT id, created_at FROM refresh_tokens WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );
    return rows.map(r => ({ id: r.id, createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at) }));
  },

  async revokeSession(sessionId: string, userId: string): Promise<void> {
    await execute('DELETE FROM refresh_tokens WHERE id = $1 AND user_id = $2', [sessionId, userId]);
  },
};
