import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID, randomBytes, randomInt, createHash, createHmac, timingSafeEqual } from 'crypto';
import { query, queryOne, execute } from '../../config/db';
import { env } from '../../config/env';
import { MIN_PASSWORD_LENGTH, PASSWORD_TOO_SHORT } from '../../config/constants';
import type { User, UserRole } from '../../types';
import { mapProfile } from '../../utils/mappers';
import {
  isMailConfigured, sendPasswordResetEmail, sendWelcomeEmail,
  sendPasswordResetOtpEmail, sendUsernameReminderEmail,
} from '../../utils/mailer';
import { invalidateProfileCache } from '../../middleware/auth';

// Password-reset tokens expire after one hour.
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
// Email OTPs (feature-gated) are short-lived and allow a few guesses only.
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

export const NOT_STORE_OWNER = 'You can only link a store you own';
export const OTP_DISABLED = 'Email OTP recovery is not enabled';
export const INVALID_OTP  = 'Invalid or expired code';
export const INVALID_CREDENTIALS = 'Invalid email/User ID or password';
export const ACCOUNT_DEACTIVATED = 'Your account has been deactivated. Please contact support.';

// bcrypt hash of a throwaway value (cost 12, like real accounts). Checking a
// password against it when no account matches makes an unknown email/User ID
// take as long as a wrong password, so response times don't reveal which
// accounts exist.
const TIMING_HASH = '$2a$12$B5CB9uHtUUsX2Xaf/5QcMuZ2Iu/vSbhOK4GSZrl7EWAYjD/01rav6';

/**
 * Profile row for a sign-in / recovery identifier: an email when it contains
 * '@', otherwise a store login ID (username, case-insensitive).
 */
async function findByIdentifier(identifier: string): Promise<Record<string, unknown> | null> {
  const id = identifier.toLowerCase().trim();
  return id.includes('@')
    ? queryOne('SELECT * FROM profiles WHERE email = $1 LIMIT 1', [id])
    : queryOne('SELECT * FROM profiles WHERE LOWER(username) = $1 LIMIT 1', [id]);
}

// OTPs are 6 digits, so a plain hash is trivially reversible — key it with the
// server secret and bind it to the user.
function hashOtp(userId: string, otp: string): string {
  return createHmac('sha256', env.jwtSecret).update(`${userId}:${otp}`).digest('hex');
}

/** Create a single-use reset-link token for a user (replaces any unused one). */
async function issueResetToken(userId: string): Promise<string> {
  const token     = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  // Only one active reset request at a time per user.
  await execute(`DELETE FROM password_resets WHERE user_id = $1 AND used = false AND kind = 'link'`, [userId]);
  await execute(
    `INSERT INTO password_resets (user_id, token_hash, expires_at, kind) VALUES ($1, $2, $3, 'link')`,
    [userId, tokenHash, expiresAt],
  );
  return token;
}

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
  /** `identifier` is the account email or, for store accounts, the User ID. */
  async signIn(identifier: string, password: string): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const row = await findByIdentifier(identifier);
    if (!row) {
      await bcrypt.compare(password, TIMING_HASH);
      throw new Error(INVALID_CREDENTIALS);
    }

    const valid = await bcrypt.compare(password, row.password_hash as string);
    if (!valid) throw new Error(INVALID_CREDENTIALS);

    if (row.is_active === false) throw new Error(ACCOUNT_DEACTIVATED);

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
    username?: string;
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
    if (opts.username) {
      const taken = await queryOne('SELECT id FROM profiles WHERE LOWER(username) = LOWER($1)', [opts.username.trim()]);
      if (taken) throw new Error('User ID already taken');
    }

    const passwordHash = await bcrypt.hash(opts.password, 12);
    const userId = randomUUID();

    await execute(
      `INSERT INTO profiles
         (id, name, email, password_hash, role, phone, city, state,
          date_of_birth, gender, address_line1, address_line2, landmark, pin_code, username)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [userId, opts.name, opts.email.toLowerCase().trim(), passwordHash, opts.role,
       opts.phone ?? null, opts.city ?? null, opts.state ?? null,
       opts.dateOfBirth ?? null, opts.gender ?? null, opts.addressLine1 ?? null,
       opts.addressLine2 ?? null, opts.landmark ?? null, opts.pinCode ?? null,
       opts.username?.trim() || null],
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
    if (patch.storeId !== undefined) {
      // store_id scopes every store API (orders, products…), so a user may only
      // point it at a store they own — never at someone else's store.
      if (patch.storeId) {
        const owned = await queryOne('SELECT id FROM stores WHERE id = $1 AND owner_id = $2', [patch.storeId, userId]);
        if (!owned) throw new Error(NOT_STORE_OWNER);
      }
      fields.push(`store_id = $${idx++}`);
      values.push(patch.storeId || null);
    }

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

    const token = await issueResetToken(row.id);
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
       WHERE token_hash = $1 AND used = false AND expires_at > NOW() AND kind = 'link'`,
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

  // ── Email-OTP recovery (only when PASSWORD_RESET_OTP_ENABLED=true) ─────────

  recoveryOptions(): { otpEnabled: boolean } {
    return { otpEnabled: env.passwordResetOtpEnabled };
  },

  /**
   * Email a 6-digit reset code. Generic response — never reveals whether the
   * account exists, and never contains the code: email is the only channel.
   */
  async requestPasswordOtp(identifier: string): Promise<{ message: string; emailSent: boolean }> {
    if (!env.passwordResetOtpEnabled) throw new Error(OTP_DISABLED);

    const message = 'If an account exists, a verification code has been sent to its email.';
    const emailSent = isMailConfigured();
    const row = await findByIdentifier(identifier);
    if (!row) return { message, emailSent };

    const userId = String(row.id);
    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await execute(`DELETE FROM password_resets WHERE user_id = $1 AND used = false AND kind = 'otp'`, [userId]);
    await execute(
      `INSERT INTO password_resets (user_id, token_hash, expires_at, kind) VALUES ($1, $2, $3, 'otp')`,
      [userId, hashOtp(userId, otp), new Date(Date.now() + OTP_TTL_MINUTES * 60_000)],
    );

    const delivered = await sendPasswordResetOtpEmail(String(row.email), otp, OTP_TTL_MINUTES);
    if (!delivered) console.error(`[auth] password reset code for user ${userId} was NOT delivered — check SMTP_HOST/MAIL_FROM`);
    return { message, emailSent };
  },

  /**
   * Check a reset code. On success returns a normal reset-link token, so the
   * existing POST /auth/reset-password completes the flow unchanged.
   */
  async verifyPasswordOtp(identifier: string, otp: string): Promise<{ resetToken: string }> {
    if (!env.passwordResetOtpEnabled) throw new Error(OTP_DISABLED);

    const user = await findByIdentifier(identifier);
    if (!user) throw new Error(INVALID_OTP);
    const userId = String(user.id);

    const row = await queryOne<{ id: string; token_hash: string; attempts: number }>(
      `SELECT id, token_hash, attempts FROM password_resets
       WHERE user_id = $1 AND kind = 'otp' AND used = false AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    if (!row || row.attempts >= OTP_MAX_ATTEMPTS) throw new Error(INVALID_OTP);

    const expected = Buffer.from(row.token_hash, 'hex');
    const actual   = Buffer.from(hashOtp(userId, String(otp).trim()), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      // Burn the code once it has taken too many guesses.
      await execute(
        `UPDATE password_resets SET attempts = attempts + 1, used = (attempts + 1 >= $2) WHERE id = $1`,
        [row.id, OTP_MAX_ATTEMPTS],
      );
      throw new Error(INVALID_OTP);
    }

    await execute('UPDATE password_resets SET used = true WHERE id = $1', [row.id]);
    return { resetToken: await issueResetToken(userId) };
  },

  /** Email the account's User ID (store logins). Generic response. */
  async forgotUsername(email: string): Promise<{ message: string; emailSent: boolean }> {
    if (!env.passwordResetOtpEnabled) throw new Error(OTP_DISABLED);

    const message = 'If an account with a User ID exists for that email, the User ID has been sent to it.';
    const row = await queryOne<{ email: string; username: string | null }>(
      'SELECT email, username FROM profiles WHERE email = $1',
      [email.toLowerCase().trim()],
    );
    if (row?.username) await sendUsernameReminderEmail(row.email, row.username);
    return { message, emailSent: isMailConfigured() };
  },
};
