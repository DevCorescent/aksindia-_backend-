import dotenv from 'dotenv';
dotenv.config();

function parseOrigins(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(Boolean);
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
