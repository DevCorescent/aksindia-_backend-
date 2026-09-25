// Run one SQL migration file in a single transaction.
//
//   node scripts/db/run-migration.mjs --db <url> [--apply] [file]
//
// Without --apply it is a dry run: every step executes, its output is printed,
// and the transaction is rolled back. With --apply it commits. Any error rolls
// back every step. The database URL must be passed explicitly — .env is never
// read, so the migration cannot reach a database by accident.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import pg from 'pg';

const DEFAULT_FILE = join(dirname(fileURLToPath(import.meta.url)),
  '../../src/db/migrations/2026-09-25-store-logins-order-tracking.sql');

const args = process.argv.slice(2);
const dbIdx = args.indexOf('--db');
const url = dbIdx >= 0 ? args[dbIdx + 1] : undefined;
const apply = args.includes('--apply');
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--db') ?? DEFAULT_FILE;
if (!url) {
  console.error('usage: node scripts/db/run-migration.mjs --db <postgres-url> [--apply] [migration.sql]');
  process.exit(2);
}

const target = new URL(url);
const local = ['127.0.0.1', 'localhost'].includes(target.hostname);
console.log(`migration : ${basename(file)}`);
console.log(`database  : ${target.hostname}${target.pathname}`);
console.log(`mode      : ${apply ? 'APPLY (commit)' : 'DRY RUN (rollback)'}\n`);

const client = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
const counts = { APPLIED: 0, SKIPPED: 0 };
client.on('notice', (n) => {
  console.log(n.message);
  const kind = n.message.split(/\s+/)[0];
  if (kind in counts) counts[kind]++;
});

await client.connect();
try {
  await client.query('BEGIN');
  await client.query(readFileSync(file, 'utf8'));
  await client.query(apply ? 'COMMIT' : 'ROLLBACK');
  console.log(`\n${counts.APPLIED} applied, ${counts.SKIPPED} already present — ${apply ? 'committed' : 'rolled back (dry run, nothing changed)'}`);
} catch (err) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error(`\nFAILED — rolled back, nothing changed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
