import dotenv from 'dotenv';
dotenv.config();

function parseOrigins(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

/** Values of boolean flags that were set but were neither true nor false. */
export const invalidFlags: string[] = [];

/**
 * An on/off flag. Only "true" turns it on (case and surrounding spaces are
 * ignored); unset, empty or "false" is off. Anything else is also off — the
 * safe side — and is reported at start-up so a typo never goes unnoticed.
 */
function parseFlag(name: string): boolean {
  const raw = (process.env[name] ?? '').trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw !== '' && raw !== 'false') invalidFlags.push(`${name}=${process.env[name]}`);
  return false;
}

export const env = {
  port:                  parseInt(process.env.PORT ?? '5000', 10),
  nodeEnv:               process.env.NODE_ENV ?? 'development',
  databaseUrl:           process.env.DATABASE_URL ?? '',
  jwtSecret:             process.env.JWT_SECRET ?? 'dev_secret',
  jwtExpiresIn:          process.env.JWT_EXPIRES_IN ?? '7d',
  refreshJwtExpiresIn:   process.env.REFRESH_JWT_EXPIRES_IN ?? '30d',
  frontendUrl:           process.env.FRONTEND_URL ?? 'http://localhost:5173',
  frontendUrls:          parseOrigins(process.env.FRONTEND_URLS ?? process.env.FRONTEND_URL ?? 'http://localhost:5173'),
  mailFrom:              process.env.MAIL_FROM ?? '',
  smtpHost:              process.env.SMTP_HOST ?? '',
  smtpPort:              parseInt(process.env.SMTP_PORT ?? '587', 10),
  smtpUser:              process.env.SMTP_USER ?? '',
  smtpPass:              process.env.SMTP_PASS ?? '',
  smtpSecure:            process.env.SMTP_SECURE === 'true',
  // Password recovery method. false (default): the reset-link flow. true:
  // email OTP verification (and "forgot User ID"). Read once at start-up.
  passwordResetOtpEnabled: parseFlag('PASSWORD_RESET_OTP_ENABLED'),
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
  cloudinaryUrl:         process.env.CLOUDINARY_URL ?? '',
  cashfreeAppId:         process.env.CASHFREE_APP_ID ?? '',
  cashfreeSecretKey:     process.env.CASHFREE_SECRET_KEY ?? '',
  cashfreeWebhookSecret: process.env.CASHFREE_WEBHOOK_SECRET ?? '',
  cashfreeEnv:           (process.env.CASHFREE_ENV ?? 'sandbox') as 'sandbox' | 'production',
};

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL must be set in .env');
}
