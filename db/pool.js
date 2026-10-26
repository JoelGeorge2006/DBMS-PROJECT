/**
 * MINERVA — PostgreSQL (Supabase) connection pool and query log
 *
 * - SUPABASE_DB_URL comes from .env (never committed). TLS is verified against
 *   Supabase's root CA in supabase-ca.crt.
 * - Every connection starts in the "minerva" schema (see db/schema.sql).
 * - query() records each statement (SQL, timing, rows, which API request ran it)
 *   in a ring buffer that the SQL log panel reads through /api/backend/sql-log.
 */
import fs from 'fs';
import path from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import { fileURLToPath } from 'url';
import pg from 'pg';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  // No .env: SUPABASE_DB_URL may be set in the environment instead
}

// NUMERIC and BIGINT arrive as strings by default; this data fits in a JS number.
// DATE stays a 'YYYY-MM-DD' string so no timezone shifts it.
pg.types.setTypeParser(1700, (v) => Number(v));
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1082, (v) => v);

export function connectionConfig() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error('SUPABASE_DB_URL is not set. Add it to .env (see README).');
  return {
    connectionString: url,
    ssl: { ca: fs.readFileSync(path.join(ROOT, 'supabase-ca.crt'), 'utf8') },
    // Every session starts in the minerva schema (db/schema.sql)
    options: '-c search_path=minerva,extensions',
  };
}

// Created on first use, so importing this module never needs the database
let pool = null;
export function getPool() {
  pool ??= new pg.Pool({ ...connectionConfig(), max: 5, idleTimeoutMillis: 30000 });
  return pool;
}

// --- Query log ---------------------------------------------------------------
// The API request a query belongs to (set by middleware in server.js)
export const requestContext = new AsyncLocalStorage();

const LOG_SIZE = 300;
const log = [];
let nextId = 1;

function record(sql, params, ms, rowCount, error) {
  const ctx = requestContext.getStore();
  if (ctx?.skipLog) return;
  log.push({
    id: nextId++,
    at: new Date().toISOString(),
    route: ctx?.route || 'server',
    user: ctx?.user || null,
    sql: (typeof sql === 'string' ? sql : sql.text).replace(/\s+/g, ' ').trim(),
    params: (params || []).map((p) => (typeof p === 'string' && p.length > 80 ? `${p.slice(0, 77)}…` : p)),
    ms: Math.round(ms * 100) / 100,
    rows: rowCount,
    error: error || null,
  });
  if (log.length > LOG_SIZE) log.shift();
}

/** Logged entries after `afterId`, oldest first */
export function sqlLog(afterId = 0) {
  return log.filter((e) => e.id > afterId);
}

/**
 * Run one statement on the pool (or on `client` inside a transaction) and log it.
 * `sql` may also be a pg query config object, e.g. { text, queryMode: 'extended' }.
 */
export async function query(sql, params = [], client = getPool()) {
  const start = performance.now();
  try {
    const res = await client.query(sql, params);
    record(sql, params, performance.now() - start, res.rowCount ?? res.rows?.length ?? 0);
    return res;
  } catch (err) {
    record(sql, params, performance.now() - start, 0, err.message);
    throw err;
  }
}

/** Run fn(client) in a transaction; rolls back if it throws */
export async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await query('BEGIN', [], client);
    const result = await fn(client);
    await query('COMMIT', [], client);
    return result;
  } catch (err) {
    await query('ROLLBACK', [], client).catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
