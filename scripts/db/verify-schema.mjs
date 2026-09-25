// Check that a database has the schema the current backend expects, and
// optionally that sign-in works against a running API.
//
//   node scripts/db/verify-schema.mjs --db <url> [--api <base-url>]
//
// Database checks run in a READ ONLY transaction. Login checks run only with
// --api and use credentials from the environment (never from arguments):
//   VERIFY_EMAIL, VERIFY_EMAIL_PASSWORD        an existing email account
//   VERIFY_USER_ID, VERIFY_USER_ID_PASSWORD    a store / service-store User ID
// A sign-in creates a session (refresh token) exactly like a normal login.
import pg from 'pg';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const url = opt('--db');
const api = opt('--api')?.replace(/\/$/, '');
if (!url) {
  console.error('usage: node scripts/db/verify-schema.mjs --db <postgres-url> [--api <base-url>]');
  process.exit(2);
}

let failed = 0;
const check = (group, name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${group.padEnd(15)} ${name}${detail ? ` — ${detail}` : ''}`);
};

const local = ['127.0.0.1', 'localhost'].includes(new URL(url).hostname);
const client = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
await client.connect();
await client.query('BEGIN READ ONLY');
const one = async (sql, params = []) => (await client.query(sql, params)).rows[0];
const column = (table, col) => one(
  `SELECT data_type, is_nullable, column_default FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`, [table, col]);
const indexDef = async (name) => (await one(
  `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`, [name]))?.indexdef ?? '';
const constraintDef = async (table, name) => (await one(
  `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
   WHERE conrelid = to_regclass($1) AND conname = $2`, [`public.${table}`, name]))?.def ?? '';

try {
  // AUTH
  const username = await column('profiles', 'username');
  check('AUTH', 'profiles.username exists (text, nullable)', username?.data_type === 'text' && username.is_nullable === 'YES');
  const uIdx = await indexDef('idx_profiles_username');
  check('AUTH', 'idx_profiles_username is UNIQUE on lower(username)',
    /CREATE UNIQUE INDEX/.test(uIdx) && /lower\(username\)/.test(uIdx) && /username IS NOT NULL/.test(uIdx), uIdx || 'missing');
  const dupes = await one(`SELECT COUNT(*)::int AS n FROM (SELECT LOWER(email) FROM profiles GROUP BY 1 HAVING COUNT(*) > 1) d`);
  check('AUTH', 'no duplicate emails', dupes.n === 0, `${dupes.n} duplicates`);
  // Data, not schema: such an account simply cannot sign in, so warn only.
  const hashes = await one(`SELECT COUNT(*)::int AS n FROM profiles WHERE password_hash NOT LIKE '$2%'`);
  console.log(`${hashes.n ? 'WARN' : 'PASS'}  ${'AUTH'.padEnd(15)} every password is a bcrypt hash${hashes.n ? ` — ${hashes.n} accounts cannot sign in` : ''}`);

  // ORDERS
  check('ORDERS', 'order_status_history exists', !!(await one(`SELECT to_regclass('public.order_status_history') AS t`)).t);
  for (const col of ['id', 'order_id', 'order_type', 'status', 'changed_by', 'note', 'created_at']) {
    check('ORDERS', `order_status_history.${col} exists`, !!(await column('order_status_history', col)));
  }
  check('ORDERS', 'idx_order_status_history_order exists', !!(await indexDef('idx_order_status_history_order')));
  const badOrders = await one(`SELECT COUNT(*)::int AS n FROM orders
    WHERE status NOT IN ('pending','processing','shipped','delivered','cancelled')`);
  check('ORDERS', 'every existing order status is valid', badOrders.n === 0, `${badOrders.n} invalid`);

  // PASSWORD RESET
  const kind = await column('password_resets', 'kind');
  check('PASSWORD RESET', "password_resets.kind exists (NOT NULL DEFAULT 'link')",
    kind?.is_nullable === 'NO' && /'link'/.test(kind.column_default ?? ''));
  const attempts = await column('password_resets', 'attempts');
  check('PASSWORD RESET', 'password_resets.attempts exists (NOT NULL DEFAULT 0)',
    attempts?.is_nullable === 'NO' && attempts.column_default === '0');

  // REVIEWS
  check('REVIEWS', 'reviews.service_id exists', (await column('reviews', 'service_id'))?.data_type === 'uuid');
  check('REVIEWS', 'reviews.service_id → services(id)', /REFERENCES services\(id\)/.test(await constraintDef('reviews', 'reviews_service_id_fkey')));
  check('REVIEWS', 'reviews.product_id is nullable', (await column('reviews', 'product_id'))?.is_nullable === 'YES');
  check('REVIEWS', 'reviews_target_check exists', /product_id IS NOT NULL.*service_id IS NOT NULL/.test(await constraintDef('reviews', 'reviews_target_check')));
  check('REVIEWS', 'idx_reviews_order_service is UNIQUE', /CREATE UNIQUE INDEX/.test(await indexDef('idx_reviews_order_service')));
  check('REVIEWS', 'idx_reviews_service exists', !!(await indexDef('idx_reviews_service')));

  // SERVICE ORDERS
  const soCheck = await constraintDef('service_orders', 'service_orders_status_check');
  check('SERVICE ORDERS', "service_orders_status_check allows 'rejected'", /'rejected'/.test(soCheck), soCheck || 'missing');
  const badSo = await one(`SELECT COUNT(*)::int AS n FROM service_orders
    WHERE status NOT IN ('pending','confirmed','in_progress','completed','cancelled','rejected')`);
  check('SERVICE ORDERS', 'every existing service order status is valid', badSo.n === 0, `${badSo.n} invalid`);
} finally {
  await client.query('ROLLBACK');
  await client.end();
}

// LOGIN (optional, against a running API)
if (api) {
  const post = async (path, body) => {
    const res = await fetch(api + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const me = async (token) => (await (await fetch(`${api}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).json().catch(() => ({}))).data;

  const probe = await fetch(`${api}/auth/recovery-options`);
  check('LOGIN', 'API runs the current backend (GET /auth/recovery-options)', probe.status === 200, `HTTP ${probe.status}`);

  const accounts = [
    ['email', process.env.VERIFY_EMAIL, process.env.VERIFY_EMAIL_PASSWORD],
    ['User ID', process.env.VERIFY_USER_ID, process.env.VERIFY_USER_ID_PASSWORD],
  ];
  for (const [label, id, password] of accounts) {
    if (!id || !password) { console.log(`SKIP  LOGIN           ${label} login (credentials not set)`); continue; }
    const r = await post('/auth/signin', { email: id, password });
    const user = r.body.data?.user;
    check('LOGIN', `${label} login`, r.status === 200 && !!r.body.data?.accessToken, r.body.error);
    if (!user) continue;
    const profile = await me(r.body.data.accessToken);
    check('LOGIN', `${label} /auth/me returns the same user (role ${user.role})`, profile?.id === user.id && profile.role === user.role);
    if (label === 'User ID') {
      check('LOGIN', 'User ID login is a store account with a store', ['store_owner', 'service_provider'].includes(user.role) && !!user.storeId);
    }
  }
}

console.log(`\n${failed ? `${failed} check(s) FAILED` : 'All checks passed'}`);
process.exitCode = failed ? 1 : 0;
