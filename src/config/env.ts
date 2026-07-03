import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port:         parseInt(process.env.PORT ?? '5000', 10),
  nodeEnv:      process.env.NODE_ENV ?? 'development',
  databaseUrl:  process.env.DATABASE_URL ?? '',
  jwtSecret:    process.env.JWT_SECRET ?? 'dev_secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  frontendUrl:  process.env.FRONTEND_URL ?? 'http://localhost:5173',
};

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL must be set in .env');
}
