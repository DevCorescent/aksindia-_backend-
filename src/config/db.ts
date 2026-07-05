import { Pool } from 'pg';
import { env } from './env';

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected pg pool error:', err.message);
});

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const { rows } = await pool.query(sql, params);
  return rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const { rows } = await pool.query(sql, params);
  return (rows[0] ?? null) as T | null;
}

export async function execute(sql: string, params?: unknown[]): Promise<number> {
  const { rowCount } = await pool.query(sql, params);
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
