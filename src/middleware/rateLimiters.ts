import rateLimit from 'express-rate-limit';

/**
 * Password-reset endpoints are unauthenticated and side-effectful — each
 * forgot-password call invalidates the account's previous unused token, so an
 * unthrottled endpoint lets anyone repeatedly break a real user's reset link.
 * Tighter than the global limiter in app.ts, which allows 500 requests/15min.
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many password reset attempts. Please try again later.' },
});
