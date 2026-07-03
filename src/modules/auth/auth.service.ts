import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { query, queryOne, execute } from '../../config/db';
import { env } from '../../config/env';
import type { User, UserRole } from '../../types';
import { mapProfile } from '../../utils/mappers';

function signToken(id: string, role: string, email: string): string {
  return jwt.sign({ id, role, email }, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
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
    const accessToken = signToken(user.id, user.role, user.email);

    return { user, accessToken, refreshToken: '' };
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
      [userId, opts.name, opts.email.toLowerCase().trim(), passwordHash, opts.role, opts.phone ?? null, opts.city ?? null, opts.state ?? null],
    );

    await execute('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);

    return { userId };
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
};
