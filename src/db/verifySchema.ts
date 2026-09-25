import { query } from '../config/db';

/**
 * Columns the current backend reads or writes that older databases lack.
 * They come from src/db/migrations/2026-09-25-store-logins-order-tracking.sql.
 */
const REQUIRED_COLUMNS: [table: string, column: string, usedBy: string][] = [
  ['profiles',             'username', 'sign-up and store User ID sign-in'],
  ['order_status_history', 'order_id', 'order status changes and tracking'],
  ['password_resets',      'kind',     'password reset'],
  ['password_resets',      'attempts', 'email-OTP password reset'],
  ['reviews',              'service_id', 'reviews'],
];

/**
 * Log, at boot, any schema the code needs but the database does not have.
 * Read-only on purpose: schema changes go through the reviewed migration, not
 * through application start-up. Deploying the code before the migration broke
 * every sign-up and User ID sign-in, and this makes that visible immediately.
 */
export async function verifySchema(): Promise<void> {
  const rows = await query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND (table_name, column_name) IN (${
       REQUIRED_COLUMNS.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')})`,
    REQUIRED_COLUMNS.flatMap(([t, c]) => [t, c]),
  );
  const present = new Set(rows.map(r => `${r.table_name}.${r.column_name}`));
  const missing = REQUIRED_COLUMNS.filter(([t, c]) => !present.has(`${t}.${c}`));
  if (missing.length === 0) return;

  for (const [t, c, usedBy] of missing) {
    console.error(`[schema] MISSING ${t}.${c} — ${usedBy} will fail`);
  }
  console.error('[schema] Apply src/db/migrations/2026-09-25-store-logins-order-tracking.sql (npm run db:migrate)');
}
