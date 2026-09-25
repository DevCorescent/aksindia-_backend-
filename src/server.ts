import app from './app';
import { env, invalidFlags } from './config/env';
import { verifySchema } from './db/verifySchema';
import { isMailConfigured } from './utils/mailer';

// Start regardless: email sign-in of existing accounts works on an older
// schema, and the log names exactly what is missing.
verifySchema().catch(err =>
  console.error('[schema] could not verify the database schema:', (err as Error).message));

for (const flag of invalidFlags) {
  console.error(`[config] ${flag} is not "true" or "false" — treated as false`);
}
console.log(`[auth] password recovery: ${env.passwordResetOtpEnabled ? 'email OTP' : 'reset link'} (PASSWORD_RESET_OTP_ENABLED=${env.passwordResetOtpEnabled})`);
if (env.passwordResetOtpEnabled && !isMailConfigured()) {
  console.error('[auth] PASSWORD_RESET_OTP_ENABLED=true but SMTP_HOST/MAIL_FROM are not set — reset codes cannot be delivered');
}

app.listen(env.port, () => {
  console.log(`AskIndia API running on port ${env.port} [${env.nodeEnv}]`);
});
