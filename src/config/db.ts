import { Pool } from 'pg';
import { env } from './env';

const POOL_MAX = 10;
const CONNECTION_TIMEOUT_MS = 10000;

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  keepAlive: true,
});

// Queries slower than this are logged as warnings so we can spot DB/pool pressure.
const SLOW_QUERY_MS = 2000;

/** Live pool utilisation — the key signal for "connection timeout" errors. */
function poolStats(): string {
  return `pool[total=${pool.totalCount}/${POOL_MAX} idle=${pool.idleCount} waiting=${pool.waitingCount}]`;
}

/** One-line, safe preview of the SQL for logs (collapsed whitespace, truncated). */
function preview(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().slice(0, 140);
}

function safeParams(params?: unknown[]): string {
  if (!params?.length) return '';
  try {
    return ` params=${JSON.stringify(params).slice(0, 200)}`;
  } catch {
    return ' params=[unserializable]';
  }
}

/** True for errors that indicate pool exhaustion / DB reachability rather than bad SQL. */
function isConnectionError(message: string): boolean {
  return /connection timeout|connection terminated|timeout expired|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|Connection terminated unexpectedly|too many clients/i.test(
    message,
  );
}

pool.on('error', (err) => {
  // Fires for errors on idle clients (e.g. the DB dropped the connection).
  console.error(`[db] idle client error: ${err.message} ${poolStats()}`);
});

pool.on('connect', () => {
  if (env.nodeEnv !== 'production') {
    console.log(`[db] new connection established ${poolStats()}`);
  }
});

/**
 * Central query runner: times every query, warns on slow ones, and on failure
 * logs the SQL, params, elapsed time and live pool stats. Connection/pool
 * timeouts get an explicit diagnostic so the root cause is obvious in the logs.
 */
async function runQuery(sql: string, params?: unknown[]) {
  const started = Date.now();
  // If we're already saturated when a query starts, that's worth surfacing.
  if (pool.waitingCount > 0) {
    console.warn(`[db] query queued while ${poolStats()} :: ${preview(sql)}`);
  }
  try {
    const res = await pool.query(sql, params);
    const ms = Date.now() - started;
    if (ms >= SLOW_QUERY_MS) {
      console.warn(`[db] SLOW ${ms}ms ${poolStats()} :: ${preview(sql)}`);
    }
    return res;
  } catch (err) {
    const ms = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[db] QUERY FAILED after ${ms}ms ${poolStats()} :: ${preview(sql)}${safeParams(params)} :: ${message}`,
    );
    if (isConnectionError(message)) {
      console.error(
        `[db] → connection/pool timeout: could not get a client within ${CONNECTION_TIMEOUT_MS}ms. ` +
          `Likely the pool is exhausted (max=${POOL_MAX}, ${poolStats()}) because queries are slow, ` +
          `or the database is unreachable/slow. Check DB latency and reduce per-request queries.`,
      );
    }
    throw err;
  }
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const { rows } = await runQuery(sql, params);
  return rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const { rows } = await runQuery(sql, params);
  return (rows[0] ?? null) as T | null;
}

export async function execute(sql: string, params?: unknown[]): Promise<number> {
  const { rowCount } = await runQuery(sql, params);
  return rowCount ?? 0;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function queryPaginated<T = Record<string, unknown>>(
  baseSql: string,
  params: unknown[],
  page: number,
  limit: number,
): Promise<PaginatedResult<T>> {
  const offset = (page - 1) * limit;

  // Count query — wrap the base SQL
  const countSql = `SELECT COUNT(*) AS total FROM (${baseSql}) AS _count_query`;
  const countRow = await queryOne<{ total: string }>(countSql, params);
  const total = Number(countRow?.total ?? 0);

  // Data query with pagination appended
  const dataSql = `${baseSql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const rows = await query<T>(dataSql, [...params, limit, offset]);

  return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}
