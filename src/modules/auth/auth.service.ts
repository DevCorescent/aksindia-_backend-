import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID, randomBytes, createHash } from 'crypto';
import { query, queryOne, execute } from '../../config/db';
import { env } from '../../config/env';
import { MIN_PASSWORD_LENGTH, PASSWORD_TOO_SHORT } from '../../config/constants';
import type { User, UserRole } from '../../types';
import { mapProfile } from '../../utils/mappers';
import { isMailConfigured, sendPasswordResetEmail, sendWelcomeEmail } from '../../utils/mailer';
import { invalidateProfileCache } from '../../middleware/auth';

// Password-reset tokens expire after one hour.
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function signAccess(id: string, role: string, email: string): string {
  return jwt.sign({ id, role, email }, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

function signRefresh(id: string): string {
  // `jti` makes every issued token unique. Without it the payload was just
  // { id, type, iat, exp } — and `iat` only has one-second resolution, so two
  // sign-ins by the same user in the same second produced a byte-identical JWT
  // that collided with the UNIQUE constraint on refresh_tokens.token, failing
  // the INSERT and turning the login into a 500.
  return jwt.sign({ id, type: 'refresh', jti: randomUUID() }, env.jwtSecret, { expiresIn: env.refreshJwtExpiresIn } as jwt.SignOptions);
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

    if (row.is_active === false) throw new Error('Your account has been deactivated. Please contact support.');

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
    dateOfBirth?: string;
    gender?: string;
    addressLine1?: string;
    addressLine2?: string;
    landmark?: string;
    pinCode?: string;
  }): Promise<{ userId: string }> {
    const existing = await queryOne('SELECT id FROM profiles WHERE email = $1', [opts.email.toLowerCase().trim()]);
    if (existing) throw new Error('Email already registered');

    const passwordHash = await bcrypt.hash(opts.password, 12);
    const userId = randomUUID();

    await execute(
      `INSERT INTO profiles
         (id, name, email, password_hash, role, phone, city, state,
          date_of_birth, gender, address_line1, address_line2, landmark, pin_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [userId, opts.name, opts.email.toLowerCase().trim(), passwordHash, opts.role,
       opts.phone ?? null, opts.city ?? null, opts.state ?? null,
       opts.dateOfBirth ?? null, opts.gender ?? null, opts.addressLine1 ?? null,
       opts.addressLine2 ?? null, opts.landmark ?? null, opts.pinCode ?? null],
    );
    await execute('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);

    // Fire-and-forget — a mail failure must never block account creation.
    sendWelcomeEmail(opts.email.toLowerCase().trim(), opts.name).catch(
      err => console.error('[auth] welcome email failed:', err),
    );

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
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

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
    invalidateProfileCache(userId);
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

  async forgotPassword(email: string): Promise<{ message: string; emailSent: boolean; devResetLink?: string }> {
    const normalized = email.toLowerCase().trim();
    const row = await queryOne<{ id: string }>(
      'SELECT id FROM profiles WHERE email = $1',
      [normalized],
    );

    // Generic response — never reveals whether the email exists.
    const message = 'If an account exists for that email, a password reset link has been generated.';
    // Reports whether delivery is configured at all, never whether this address
    // matched — so the value is identical for known and unknown emails.
    const emailSent = isMailConfigured();
    if (!row) return { message, emailSent };

    const token     = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    // Only one active reset request at a time per user.
    await execute('DELETE FROM password_resets WHERE user_id = $1 AND used = false', [row.id]);
    await execute(
      'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [row.id, tokenHash, expiresAt],
    );

    const resetLink = `${env.frontendUrl}/reset-password?token=${token}`;
    const delivered = await sendPasswordResetEmail(normalized, resetLink);

    let devResetLink: string | undefined;
    if (!delivered) {
      if (env.nodeEnv === 'production') {
        console.error(`[auth] password reset for ${normalized} was NOT delivered — configure SMTP_HOST/MAIL_FROM`);
      } else {
        devResetLink = resetLink;
      }
    }

    return { message, emailSent, ...(devResetLink ? { devResetLink } : {}) };
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (!token) throw new Error('Invalid or expired reset token');
    if (newPassword.length < MIN_PASSWORD_LENGTH) throw new Error(PASSWORD_TOO_SHORT);

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const row = await queryOne<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM password_resets
       WHERE token_hash = $1 AND used = false AND expires_at > NOW()`,
      [tokenHash],
    );
    if (!row) throw new Error('Invalid or expired reset token');

    const newHash = await bcrypt.hash(newPassword, 12);
    await execute(
      'UPDATE profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHash, row.user_id],
    );
    // Single-use token — invalidated now.
    await execute('UPDATE password_resets SET used = true WHERE id = $1', [row.id]);
    // Revoke all active sessions for the user.
    await execute('DELETE FROM refresh_tokens WHERE user_id = $1', [row.user_id]);
    invalidateProfileCache(row.user_id);
  },
};
