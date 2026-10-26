/**
 * MINERVA — National Mineral Geospatial Intelligence Grid
 * Course: BACSE202 - Database Systems
 * Backend REST API Service (Node.js, Express, PostgreSQL on Supabase)
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, requestContext, sqlLog, getPool } from './db/pool.js';
import { createAuth, readCookie, sessionCookie, clearedCookie, clientIp, SESSION_COOKIE, ROLES } from './lib/auth.js';

const __filename = fileURLToPath(import.meta.url);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '100kb' }));

// Every query run while handling a request is tagged with that request in the SQL log.
// The log's own endpoint is left out, or polling it would fill the log.
app.use('/api', (req, res, next) => {
  const route = `${req.method} ${req.baseUrl}${req.path}`;
  requestContext.run({ route, skipLog: req.path === '/backend/sql-log' }, next);
});

// ============================================================================
// 1. AUTHENTICATION (sessions, roles) — see lib/auth.js
// ============================================================================
const auth = createAuth();

const sendAuthError = (res, r) => {
  if (r.retryAfterMs) res.setHeader('Retry-After', Math.ceil(r.retryAfterMs / 1000));
  res.status(r.status).json({ success: false, error: r.error, retryAfterMs: r.retryAfterMs, attemptsLeft: r.attemptsLeft });
};

app.post('/api/auth/login', async (req, res) => {
  const { username, pin } = req.body || {};
  const r = await auth.login(username, pin, clientIp(req));
  if (!r.ok) return sendAuthError(res, r);
  res.setHeader('Set-Cookie', sessionCookie(r.token, r.maxAgeMs));
  res.json({ success: true, user: r.user });
});

app.post('/api/auth/logout', async (req, res) => {
  await auth.logout(readCookie(req, SESSION_COOKIE));
  res.setHeader('Set-Cookie', clearedCookie());
  res.json({ success: true });
});

app.post('/api/auth/reset/request', async (req, res) => {
  const r = await auth.requestReset(req.body?.username, clientIp(req));
  if (!r.ok) return sendAuthError(res, r);
  res.json({ success: true, demoCode: r.demoCode, expiresInMinutes: r.expiresInMinutes });
});

app.post('/api/auth/reset/confirm', async (req, res) => {
  const { username, code, pin } = req.body || {};
  const r = await auth.confirmReset(username, code, pin, clientIp(req));
  if (!r.ok) return sendAuthError(res, r);
  res.json({ success: true });
});

// Who is signed in (null when nobody is): public, so a first visit isn't an error
app.get('/api/auth/me', async (req, res) => {
  res.json({ success: true, user: await auth.sessionUser(readCookie(req, SESSION_COOKIE)) });
});

// Every other /api route needs a signed-in user
const PUBLIC_API = new Set(['/api/auth/me', '/api/auth/login', '/api/auth/logout', '/api/auth/reset/request', '/api/auth/reset/confirm', '/api/health']);

app.use('/api', async (req, res, next) => {
  const route = req.originalUrl.split('?')[0].replace(/\/+$/, '') || '/';
  if (PUBLIC_API.has(route)) return next();
  const user = await auth.sessionUser(readCookie(req, SESSION_COOKIE));
  if (!user) return res.status(401).json({ success: false, error: 'Sign in required.' });
  req.user = user;
  const ctx = requestContext.getStore();
  if (ctx) ctx.user = user.username;
  next();
});

const can = (req, permission) => Boolean(req.user && ROLES[req.user.role]?.permissions.has(permission));

function requirePermission(permission) {
  return (req, res, next) => {
    if (can(req, permission)) return next();
    res.status(403).json({ success: false, error: `Your role (${req.user?.roleLabel || 'none'}) can't do this.` });
  };
}

// ============================================================================
// 2. MINES, LEASES AND THE ENTITY TABLES
// ============================================================================

app.get('/api/kpi/metrics', async (req, res) => {
  const { rows: [r] } = await query(`SELECT
      (SELECT COUNT(*) FROM mine WHERE status IN ('Operational', 'Under Maintenance', 'Expiring')) AS active_mines,
      (SELECT COUNT(DISTINCT craton_region) FROM location) AS craton_regions,
      (SELECT COUNT(*) FROM lease WHERE valid_till > CURRENT_DATE) AS active_leases,
      (SELECT COALESCE(SUM(quantity_mt), 0) FROM production WHERE fiscal_year = 2024) AS production_2024`);
  res.json({
    success: true,
    data: { activeMines: r.active_mines, cratonRegions: r.craton_regions, activeLeases: r.active_leases, production2024MT: r.production_2024 },
  });
});

const STATUS_CLASS = {
  Operational: 'operational',
  'Under Maintenance': 'maintenance',
  Expiring: 'expiring',
  Revoked: 'revoked',
  Closed: 'closed',
  Unknown: 'unknown',
};

function mineralDot(name, type) {
  const n = (name || '').toLowerCase();
  const t = type || '';
  if (!name) return 'none';
  if (t.startsWith('Fuel')) return 'coal';
  if (n.includes('copper')) return 'teal';
  if (n.includes('lead') || n.includes('zinc')) return 'gray';
  if (n.includes('bauxite')) return 'amber';
  if (/chrom|manganese|tungsten/.test(n)) return 'brown';
  if (t.includes('Ferrous') || n.includes('iron')) return 'rust';
  if (t.includes('Precious') || t === 'Gemstone') return 'gold';
  if (t === 'Atomic') return 'atomic';
  return 'stone';
}

const pct = (v) => (v === null || v === undefined ? null : `${v}%`);
const isoDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

/** One v_mines_master row, shaped for the front end. Missing facts stay null. */
function formatMine(r, productionByMine) {
  const hasAssay = [r.fe_pct, r.sio2_pct, r.al2o3_pct, r.phosphorus_pct, r.moisture_pct].some((v) => v !== null && v !== undefined);
  return {
    mineId: r.mine_id,
    mineName: r.mine_name,
    primaryMineral: r.primary_mineral || 'Not recorded',
    mineralRecorded: Boolean(r.primary_mineral),
    mineralCategory: r.mineral_type || null,
    commodity: r.commodity_name || null,
    mineralDotColor: mineralDot(r.primary_mineral, r.mineral_type),
    state: r.state,
    district: r.district,
    stateDistrict: r.state_district,
    operatingLessee: r.operating_lessee || null,
    leaseValidity: r.lease_validity || null,
    status: r.status,
    statusClass: STATUS_CLASS[r.status] || 'unknown',
    mineType: r.mine_type,
    coords: [r.latitude, r.longitude],
    precision: r.location_precision,
    isSample: r.is_sample,
    source: { name: r.source_name, licence: r.source_licence, ref: r.source_ref, url: r.source_url },
    dossier: {
      fullName: `${r.mine_name} (${r.mine_id})`,
      gradeDescription: r.ore_grade_description || null,
      assay: hasAssay
        ? { fe: pct(r.fe_pct), sio2: pct(r.sio2_pct), al2o3: pct(r.al2o3_pct), phosphorus: pct(r.phosphorus_pct), moisture: pct(r.moisture_pct) }
        : null,
      lease: r.lease_id
        ? {
            id: r.lease_id,
            executed: isoDate(r.execution_date),
            validTill: isoDate(r.valid_till),
            royaltyRate: `${r.royalty_rate_pct}% ASP`,
            area: r.area_formatted,
          }
        : null,
      production: productionSummary(productionByMine.get(r.mine_id) || []),
      clearance: r.lease_id
        ? {
            title: r.forest_clearance_stage,
            subtitle: `CTO valid till ${String(isoDate(r.cto_valid_till) || '').slice(0, 4) || '—'}`,
            approved: r.status !== 'Under Maintenance' && r.status !== 'Revoked',
          }
        : null,
    },
  };
}

function productionSummary(rows) {
  const latest = rows[rows.length - 1];
  return {
    currentOutput: latest ? `${latest.quantity_mt} MT (${latest.fiscal_year})` : 'No records',
    history: rows.map((row) => ({ year: `'${String(row.fiscal_year).slice(2)}`, mt: row.quantity_mt })),
  };
}

/** Yearly output of each mine's primary mineral, for many mines in one query */
async function productionFor(mineIds) {
  const byMine = new Map();
  if (!mineIds.length) return byMine;
  const { rows } = await query(`SELECT p.mine_id, p.fiscal_year, p.quantity_mt
    FROM production p
    JOIN mine_mineral mm ON mm.mine_id = p.mine_id AND mm.mineral_id = p.mineral_id AND mm.is_primary
    WHERE p.mine_id = ANY($1)
    ORDER BY p.mine_id, p.fiscal_year`, [mineIds]);
  rows.forEach((r) => {
    if (!byMine.has(r.mine_id)) byMine.set(r.mine_id, []);
    byMine.get(r.mine_id).push(r);
  });
  return byMine;
}

/** WHERE clause + params shared by the list and CSV routes */
function mineFilters(q) {
  const { search, state, mineral, status, bbox } = q;
  const where = [];
  const params = [];
  const add = (v) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (state && state !== 'ALL') where.push(`state = ${add(state)}`);
  if (mineral && mineral !== 'ALL') {
    const p = add(`%${mineral}%`);
    where.push(`(primary_mineral ILIKE ${p} OR ore_grade_description ILIKE ${p})`);
  }
  if (status && status !== 'ALL') where.push(`status::text = ${add(status)}`);
  if (search) {
    const p = add(`%${search}%`);
    where.push(`(mine_id ILIKE ${p} OR mine_name ILIKE ${p} OR primary_mineral ILIKE ${p} OR state_district ILIKE ${p}
      OR operating_lessee ILIKE ${p} OR lease_id ILIKE ${p}
      OR mine_id IN (SELECT mine_id FROM mine_alias WHERE alias ILIKE ${p}))`);
  }
  if (bbox) {
    // minLng,minLat,maxLng,maxLat -> PostGIS bounding-box test, served by the GiST index on mine.geom
    const box = String(bbox).split(',').map(Number);
    if (box.length !== 4 || box.some((v) => !Number.isFinite(v))) {
      throw Object.assign(new Error('bbox must be minLng,minLat,maxLng,maxLat'), { status: 400 });
    }
    where.push(`mine_id IN (SELECT mine_id FROM mine WHERE geom && ST_MakeEnvelope(${box.map(add).join(', ')}, 4326))`);
  }
  return { sql: where.length ? ` WHERE ${where.join(' AND ')}` : '', params };
}

app.get('/api/mines', async (req, res) => {
  const { sql, params } = mineFilters(req.query);
  // No limit by default: the map needs every mine. limit/offset still page if given.
  const limit = Math.min(Number.parseInt(req.query.limit, 10) || 10000, 10000);
  const offset = Number.parseInt(req.query.offset, 10) || 0;
  const n = params.length;
  const [{ rows }, { rows: [count] }] = await Promise.all([
    query(`SELECT * FROM v_mines_master${sql} ORDER BY is_sample DESC, lower(mine_name), mine_id LIMIT $${n + 1} OFFSET $${n + 2}`, [...params, limit, offset]),
    query(`SELECT COUNT(*) AS n FROM v_mines_master${sql}`, params),
  ]);
  const production = await productionFor(rows.map((r) => r.mine_id));
  res.json({ success: true, count: rows.length, total: count.n, data: rows.map((r) => formatMine(r, production)) });
});

app.get(['/api/mines/:id/dossier', '/api/mines/:id'], async (req, res, next) => {
  if (req.params.id === 'export') return next();
  const { rows: [row] } = await query('SELECT * FROM v_mines_master WHERE upper(mine_id) = upper($1)', [req.params.id]);
  if (!row) return res.status(404).json({ success: false, error: `Mine ${req.params.id} not found.` });
  const [{ rows: aliases }, production] = await Promise.all([
    query('SELECT alias FROM mine_alias WHERE mine_id = $1 ORDER BY alias', [row.mine_id]),
    productionFor([row.mine_id]),
  ]);
  res.json({ success: true, data: { ...formatMine(row, production), aliases: aliases.map((a) => a.alias) } });
});

app.get(['/api/mines/export', '/api/export/csv'], async (req, res) => {
  const { sql, params } = mineFilters(req.query);
  const { rows } = await query(`SELECT * FROM v_mines_master${sql} ORDER BY is_sample DESC, lower(mine_name), mine_id`, params);
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['MINE ID', 'MINE NAME', 'PRIMARY MINERAL', 'STATE', 'DISTRICT', 'OPERATOR', 'LEASE VALIDITY', 'STATUS',
    'LATITUDE', 'LONGITUDE', 'LOCATION PRECISION', 'SOURCE', 'SOURCE URL', 'SAMPLE RECORD'];
  const lines = rows.map((m) => [
    m.mine_id, m.mine_name, m.primary_mineral, m.state, m.district, m.operating_lessee, m.lease_validity, m.status,
    m.latitude, m.longitude, m.location_precision, m.source_name, m.source_url, m.is_sample ? 'yes' : 'no',
  ].map(cell).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="MINERVA_mines.csv"');
  res.send([header.join(','), ...lines].join('\n'));
});

// Read-only SQL console: one statement, in a read-only transaction, as a role that
// can read the data but not account secrets, with a time limit
const SQL_ROW_LIMIT = 1000;

app.post('/api/sql/query', requirePermission('sql'), async (req, res) => {
  const text = typeof req.body?.query === 'string' ? req.body.query.trim().replace(/;\s*$/, '') : '';
  if (!text) return res.status(400).json({ success: false, error: 'SQL query string required.' });

  const client = await getPool().connect();
  try {
    await query('BEGIN READ ONLY', [], client);
    await query('SET LOCAL ROLE minerva_reader', [], client);
    await query("SET LOCAL statement_timeout = '5s'", [], client);
    const start = performance.now();
    // The extended protocol runs exactly one statement: "SELECT 1; DELETE ..." is rejected
    const result = await query({ text, queryMode: 'extended' }, [], client);
    const durationMs = (performance.now() - start).toFixed(2);
    const rows = result.rows || [];
    res.json({
      success: true,
      columns: (result.fields || []).map((f) => f.name),
      rowCount: rows.length,
      truncated: rows.length > SQL_ROW_LIMIT,
      executionTimeMs: durationMs,
      rows: rows.slice(0, SQL_ROW_LIMIT),
    });
  } catch (err) {
    const readOnly = err.code === '25006' ? 'The SQL console is read-only. ' : '';
    res.status(400).json({ success: false, error: readOnly + err.message });
  } finally {
    await query('ROLLBACK', [], client).catch(() => {});
    client.release();
  }
});

// Entity tables for the database view's tabs
const ENTITY_SQL = {
  minerals: `SELECT m.mineral_id, m.mineral_name, m.mineral_type, c.commodity_name, m.fe_pct, m.sio2_pct, m.al2o3_pct, m.phosphorus_pct, m.moisture_pct
    FROM mineral m JOIN commodity c ON c.commodity_id = m.commodity_id ORDER BY m.mineral_id`,
  locations: `SELECT l.location_id, s.state_name AS state, l.district, l.craton_region, l.latitude, l.longitude
    FROM location l JOIN state s ON s.state_id = l.state_id ORDER BY s.state_name, l.district`,
  companies: 'SELECT * FROM mining_company ORDER BY company_id',
  leases: 'SELECT * FROM lease ORDER BY valid_till',
  production: 'SELECT * FROM production ORDER BY fiscal_year DESC, quantity_mt DESC',
};

Object.entries(ENTITY_SQL).forEach(([name, sql]) => {
  app.get(`/api/${name}`, async (req, res) => {
    const { rows } = await query(sql);
    res.json({ success: true, count: rows.length, data: rows });
  });
});

// Public statistics, through the views that join them (see db/schema.sql)
const DATASETS = {
  states: 'SELECT * FROM v_state_mining_profile ORDER BY value_rank NULLS LAST, state_name',
  commodities: `SELECT * FROM v_commodity_overview
    ORDER BY production_value_2023_24_crore DESC NULLS LAST, mining_leases DESC NULLS LAST, commodity_name`,
  auctions: 'SELECT * FROM v_auction_results ORDER BY announced_on DESC, final_price_offer_pct DESC',
  royalty: `SELECT r.schedule_year, COALESCE(c.commodity_name, '(any other mineral)') AS commodity, r.grade, r.basis, r.rate_pct, r.rate_rs, r.rate_text
    FROM royalty_rate r LEFT JOIN commodity c ON c.commodity_id = r.commodity_id
    ORDER BY r.schedule_year DESC, c.commodity_name NULLS LAST, r.grade`,
  reserves: `SELECT c.commodity_name, r.form, r.unit, r.reserves, r.remaining_resources, r.total_resources, r.as_on
    FROM mineral_reserve r JOIN commodity c ON c.commodity_id = r.commodity_id ORDER BY c.commodity_name, r.form`,
  'national-production': `SELECT p.product_name, c.commodity_name, p.unit, n.fiscal_year, n.quantity, n.value_rs_thousand, n.is_provisional
    FROM national_production n JOIN mineral_product p ON p.product_id = n.product_id JOIN commodity c ON c.commodity_id = p.commodity_id
    ORDER BY n.fiscal_year DESC, n.value_rs_thousand DESC NULLS LAST`,
};

app.get('/api/data/:dataset', async (req, res) => {
  const sql = Object.hasOwn(DATASETS, req.params.dataset) ? DATASETS[req.params.dataset] : null;
  if (!sql) return res.status(404).json({ success: false, error: 'No such dataset.' });
  const { rows } = await query(sql);
  res.json({ success: true, count: rows.length, sql: sql.replace(/\s+/g, ' '), data: rows });
});

// Analytical views
['district-occurrences:v_district_mineral_occurrence', 'cross-state-production:v_cross_state_production', 'lease-compliance:v_lease_lifecycle_compliance']
  .forEach((pair) => {
    const [route, view] = pair.split(':');
    app.get(`/api/analytics/${route}`, async (req, res) => {
      const { rows } = await query(`SELECT * FROM ${view}`);
      res.json({ success: true, count: rows.length, data: rows });
    });
  });

// ============================================================================
// 3. BACKEND VISIBILITY: schema (ER diagram), objects, rows, SQL log
// ============================================================================

// Tables whose rows only an administrator may browse; hashes are always masked
const ADMIN_ONLY_RELATIONS = new Set(['app_user', 'user_session', 'pin_reset', 'audit_log']);
const SECRET_COLUMNS = new Set(['password_hash', 'password_salt', 'token_hash', 'code_hash']);

const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;

/** Tables and views of the minerva schema, with their columns (cached for a minute) */
let catalogCache = { at: 0, value: null };
async function catalog() {
  if (catalogCache.value && Date.now() - catalogCache.at < 60000) return catalogCache.value;
  const [{ rows: relations }, { rows: columns }] = await Promise.all([
    query(`SELECT c.relname AS name, CASE c.relkind WHEN 'v' THEN 'view' ELSE 'table' END AS kind, obj_description(c.oid, 'pg_class') AS comment
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'minerva' AND c.relkind IN ('r', 'v') ORDER BY c.relname`),
    query(`SELECT table_name, column_name, ordinal_position, data_type, udt_name, is_nullable = 'YES' AS nullable,
        column_default, is_identity = 'YES' AS identity, col_description(format('minerva.%I', table_name)::regclass, ordinal_position) AS comment
      FROM information_schema.columns WHERE table_schema = 'minerva' ORDER BY table_name, ordinal_position`),
  ]);
  const byRelation = new Map(relations.map((r) => [r.name, { ...r, columns: [] }]));
  columns.forEach((c) => {
    byRelation.get(c.table_name)?.columns.push({
      name: c.column_name,
      type: c.data_type === 'USER-DEFINED' ? c.udt_name : c.data_type,
      nullable: c.nullable,
      default: c.column_default,
      identity: c.identity,
      comment: c.comment,
    });
  });
  catalogCache = { at: Date.now(), value: byRelation };
  return byRelation;
}

app.get('/api/backend/schema', async (req, res) => {
  const relations = await catalog();
  const tables = [...relations.values()].filter((r) => r.kind === 'table');
  const [{ rows: constraints }, { rows: enums }, { rows: [db] }, { rows: counts }] = await Promise.all([
    query(`SELECT con.conname AS name, con.contype AS type, rel.relname AS table_name,
        ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum ORDER BY k.ord) AS columns,
        frel.relname AS ref_table,
        ARRAY(SELECT a.attname::text FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum ORDER BY k.ord) AS ref_columns,
        CASE con.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'r' THEN 'RESTRICT' WHEN 'a' THEN 'NO ACTION' END AS on_delete,
        pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      LEFT JOIN pg_class frel ON frel.oid = con.confrelid
      WHERE n.nspname = 'minerva' ORDER BY rel.relname, con.contype, con.conname`),
    query(`SELECT t.typname AS name, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'minerva' GROUP BY t.typname ORDER BY t.typname`),
    query(`SELECT version() AS version, pg_size_pretty(pg_database_size(current_database())) AS database_size,
        (SELECT pg_size_pretty(SUM(pg_total_relation_size(c.oid))) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'minerva' AND c.relkind = 'r') AS schema_size`),
    // Exact row counts, one UNION ALL query for every table
    query(tables.map((t) => `SELECT '${t.name}' AS name, COUNT(*) AS n FROM ${quoteIdent(t.name)}`).join(' UNION ALL ')),
  ]);
  const rowCount = new Map(counts.map((c) => [c.name, c.n]));
  res.json({
    success: true,
    database: { engine: 'PostgreSQL (Supabase)', version: db.version.split(' on ')[0], schema: 'minerva', size: db.database_size, schemaSize: db.schema_size },
    relations: [...relations.values()].map((r) => ({ ...r, rows: rowCount.get(r.name) ?? null, adminOnly: ADMIN_ONLY_RELATIONS.has(r.name) })),
    constraints,
    enums,
  });
});

app.get('/api/backend/objects', async (req, res) => {
  const [{ rows: views }, { rows: triggers }, { rows: indexes }] = await Promise.all([
    query(`SELECT c.relname AS name, obj_description(c.oid, 'pg_class') AS comment, pg_get_viewdef(c.oid, true) AS definition
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'minerva' AND c.relkind = 'v' ORDER BY c.relname`),
    query(`SELECT t.tgname AS name, c.relname AS table_name, pg_get_triggerdef(t.oid, true) AS definition,
        p.proname AS function_name, pg_get_functiondef(p.oid) AS function_definition
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE n.nspname = 'minerva' AND NOT t.tgisinternal ORDER BY p.proname, c.relname`),
    query(`SELECT i.indexname AS name, i.tablename AS table_name, i.indexdef AS definition,
        pg_size_pretty(pg_relation_size(format('minerva.%I', i.indexname)::regclass)) AS size,
        s.idx_scan AS scans
      FROM pg_indexes i
      LEFT JOIN pg_stat_user_indexes s ON s.schemaname = i.schemaname AND s.indexrelname = i.indexname
      WHERE i.schemaname = 'minerva' ORDER BY i.tablename, i.indexname`),
  ]);
  res.json({ success: true, views, triggers, indexes });
});

// First rows of one table or view (the name must be in the catalog: never raw input in SQL)
app.get('/api/backend/relations/:name/rows', async (req, res) => {
  const relation = (await catalog()).get(req.params.name);
  if (!relation) return res.status(404).json({ success: false, error: 'No such table or view.' });
  if (ADMIN_ONLY_RELATIONS.has(relation.name) && !can(req, 'sql')) {
    return res.status(403).json({ success: false, error: 'Only an administrator can browse account tables.' });
  }
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200);
  const select = relation.columns.map((c) => {
    if (SECRET_COLUMNS.has(c.name)) return `'••••' AS ${quoteIdent(c.name)}`;
    if (c.type === 'geometry') return `ST_AsText(${quoteIdent(c.name)}) AS ${quoteIdent(c.name)}`;
    return quoteIdent(c.name);
  });
  const sql = `SELECT ${select.join(', ')} FROM ${quoteIdent(relation.name)} LIMIT ${limit}`;
  const start = performance.now();
  const { rows } = await query(sql);
  res.json({ success: true, name: relation.name, kind: relation.kind, sql, ms: Math.round((performance.now() - start) * 100) / 100, rows });
});

app.get('/api/backend/sql-log', (req, res) => {
  res.json({ success: true, entries: sqlLog(Number.parseInt(req.query.after, 10) || 0) });
});

app.get('/api/health', async (req, res) => {
  let database = 'unreachable';
  try {
    await query('SELECT 1');
    database = 'PostgreSQL (Supabase) reachable';
  } catch {
    // Reported below
  }
  res.json({ status: database === 'unreachable' ? 'DEGRADED' : 'HEALTHY', service: 'MINERVA Mineral Resource Management Backend', database, timestamp: new Date().toISOString() });
});

// Errors from async routes (Express 5 forwards rejected promises here)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[MINERVA API] ${req.method} ${req.originalUrl}:`, err.message);
  res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Database error. See the server log.' });
});

// Boot Server when run directly
if (process.argv[1] && __filename === path.resolve(process.argv[1])) {
  app.listen(PORT, () => {
    console.log(`[MINERVA BACKEND] REST API active on http://localhost:${PORT}`);
  });
}

export default app;
