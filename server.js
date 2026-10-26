/**
 * MINERVA — National Mineral Geospatial Intelligence Grid
 * Course: BACSE202 - Database Systems
 * Backend REST API Service (Node.js, Express, better-sqlite3)
 */

import express from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { migrate } from './db/migrate.js';
import { createAuth, readCookie, sessionCookie, clearedCookie, clientIp, SESSION_COOKIE, ROLES } from './lib/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'minerva.db');

app.use(express.json({ limit: '100kb' }));

// ============================================================================
// 1. Database Connection & Schema Bootstrapping
// ============================================================================
let db;
try {
  db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  // Creates the database from schema.sql, or migrates an older one (PRAGMA user_version)
  console.log(`[MINERVA DB] ${DB_PATH}: ${migrate(db)}`);
} catch (err) {
  console.error('[MINERVA DB] Fatal database error:', err);
  process.exit(1);
}

// ============================================================================
// 2. AUTHENTICATION (sessions, roles) — see lib/auth.js
// ============================================================================
const auth = createAuth(db);

const sendAuthError = (res, r) => {
  if (r.retryAfterMs) res.setHeader('Retry-After', Math.ceil(r.retryAfterMs / 1000));
  res.status(r.status).json({ success: false, error: r.error, retryAfterMs: r.retryAfterMs, attemptsLeft: r.attemptsLeft });
};

app.post('/api/auth/login', (req, res) => {
  const { username, pin } = req.body || {};
  const ip = clientIp(req);
  const r = auth.login(username, pin, ip);
  if (!r.ok) return sendAuthError(res, r);
  res.setHeader('Set-Cookie', sessionCookie(r.token, r.maxAgeMs));
  res.json({ success: true, user: r.user });
});

app.post('/api/auth/logout', (req, res) => {
  auth.logout(readCookie(req, SESSION_COOKIE));
  res.setHeader('Set-Cookie', clearedCookie());
  res.json({ success: true });
});

app.post('/api/auth/reset/request', (req, res) => {
  const r = auth.requestReset(req.body?.username, clientIp(req));
  if (!r.ok) return sendAuthError(res, r);
  res.json({ success: true, demoCode: r.demoCode, expiresInMinutes: r.expiresInMinutes });
});

app.post('/api/auth/reset/confirm', (req, res) => {
  const { username, code, pin } = req.body || {};
  const r = auth.confirmReset(username, code, pin, clientIp(req));
  if (!r.ok) return sendAuthError(res, r);
  res.json({ success: true });
});

// Who is signed in (null when nobody is): public, so a first visit isn't an error
app.get('/api/auth/me', (req, res) => {
  res.json({ success: true, user: auth.sessionUser(readCookie(req, SESSION_COOKIE)) });
});

// Every other /api route needs a signed-in user
const PUBLIC_API = new Set(['/api/auth/me', '/api/auth/login', '/api/auth/logout', '/api/auth/reset/request', '/api/auth/reset/confirm', '/api/health']);

app.use('/api', (req, res, next) => {
  const route = req.originalUrl.split('?')[0].replace(/\/+$/, '') || '/';
  if (PUBLIC_API.has(route)) return next();
  const user = auth.sessionUser(readCookie(req, SESSION_COOKIE));
  if (!user) return res.status(401).json({ success: false, error: 'Sign in required.' });
  req.user = user;
  next();
});

function requirePermission(permission) {
  return (req, res, next) => {
    if (req.user && ROLES[req.user.role]?.permissions.has(permission)) return next();
    res.status(403).json({ success: false, error: `Your role (${req.user?.roleLabel || 'none'}) can't do this.` });
  };
}


// ============================================================================
// 3. REST API ENDPOINTS
// ============================================================================

// 1. GET /api/kpi/metrics (Dashboard Telemetry Counters)
app.get('/api/kpi/metrics', (req, res) => {
  try {
    const activeMinesRow = db.prepare("SELECT count(*) as count FROM MINE WHERE status IN ('Operational', 'Under Maintenance', 'Expiring')").get();
    const cratonsRow = db.prepare("SELECT count(DISTINCT craton_region) as count FROM LOCATION").get();
    const concessionsRow = db.prepare("SELECT count(*) as count FROM LEASE WHERE valid_till > date('now')").get();
    const annualYieldRow = db.prepare("SELECT coalesce(sum(quantity_mt), 0) as total FROM PRODUCTION WHERE fiscal_year = 2024").get();

    res.json({
      success: true,
      data: {
        activeMines: activeMinesRow.count,
        cratonRegions: cratonsRow.count,
        activeLeases: concessionsRow.count,
        production2024MT: annualYieldRow.total
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// 3. GET /api/mines (Master Grid with Query Filters & Search)
// One mine row from v_mines_master, shaped for the front end. Missing facts stay null.
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

function formatMine(r) {
  const hasAssay = [r.fe_pct, r.sio2_pct, r.al2o3_pct, r.phosphorus_pct, r.moisture_pct].some((v) => v !== null && v !== undefined);
  return {
    mineId: r.mine_id,
    mineName: r.mine_name,
    primaryMineral: r.primary_mineral || 'Not recorded',
    mineralRecorded: Boolean(r.primary_mineral),
    mineralCategory: r.mineral_type || null,
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
    isSample: Boolean(r.is_sample),
    source: { name: r.source_name, licence: r.source_licence, ref: r.source_ref, url: r.source_url },
    dossier: {
      fullName: `${r.mine_name} (${r.mine_id})`,
      gradeDescription: r.ore_grade_description || null,
      assay: hasAssay
        ? { fe: pct(r.fe_pct), sio2: pct(r.sio2_pct), al2o3: pct(r.al2o3_pct), phosphorus: pct(r.phosphorus_pct), moisture: pct(r.moisture_pct) }
        : null,
      lease: r.lease_id
        ? { id: r.lease_id, executed: r.execution_date, validTill: r.valid_till, royaltyRate: r.royalty_rate, area: r.area_formatted }
        : null,
      production: productionSummary(r.mine_id),
      clearance: r.lease_id
        ? {
            title: r.forest_clearance_stage,
            subtitle: `CTO valid till ${String(r.cto_valid_till || '').slice(0, 4) || '—'}`,
            approved: r.status !== 'Under Maintenance' && r.status !== 'Revoked',
          }
        : null,
    },
  };
}

/** WHERE clause + params shared by the list and CSV routes */
function mineFilters(query) {
  const { search, state, mineral, status, bbox } = query;
  const where = [];
  const params = [];
  if (state && state !== 'ALL') {
    where.push('state = ?');
    params.push(state);
  }
  if (mineral && mineral !== 'ALL') {
    where.push('(primary_mineral LIKE ? OR ore_grade_description LIKE ?)');
    params.push(`%${mineral}%`, `%${mineral}%`);
  }
  if (status && status !== 'ALL') {
    where.push('status = ?');
    params.push(status);
  }
  if (search) {
    where.push(`(mine_id LIKE ? OR mine_name LIKE ? OR primary_mineral LIKE ? OR state_district LIKE ?
      OR operating_lessee LIKE ? OR lease_id LIKE ?
      OR mine_id IN (SELECT mine_id FROM MINE_ALIAS WHERE alias LIKE ?))`);
    const q = `%${search}%`;
    params.push(q, q, q, q, q, q, q);
  }
  if (bbox) {
    // minLng,minLat,maxLng,maxLat -> R*Tree range query instead of scanning every mine
    const [minLng, minLat, maxLng, maxLat] = String(bbox).split(',').map(Number);
    if ([minLng, minLat, maxLng, maxLat].some((v) => !Number.isFinite(v))) {
      throw Object.assign(new Error('bbox must be minLng,minLat,maxLng,maxLat'), { status: 400 });
    }
    // Overlap test: the R*Tree stores float32 boxes widened outwards, so a containment
    // test would drop mines lying exactly on the bbox edge
    where.push('mine_rowid IN (SELECT id FROM MINE_RTREE WHERE max_lng >= ? AND min_lng <= ? AND max_lat >= ? AND min_lat <= ?)');
    params.push(minLng, maxLng, minLat, maxLat);
  }
  return { sql: where.length ? ` WHERE ${where.join(' AND ')}` : '', params };
}

// Yearly output of a mine's primary mineral from the PRODUCTION table
const productionHistoryStmt = db.prepare(`
  SELECT p.fiscal_year, p.quantity_mt
  FROM PRODUCTION p
  JOIN MINE_MINERAL mm ON mm.mine_id = p.mine_id AND mm.mineral_id = p.mineral_id AND mm.is_primary = 1
  WHERE p.mine_id = ?
  ORDER BY p.fiscal_year
`);

function productionSummary(mineId) {
  const rows = productionHistoryStmt.all(mineId);
  const latest = rows[rows.length - 1];
  return {
    currentOutput: latest ? `${latest.quantity_mt} MT (${latest.fiscal_year})` : 'No records',
    history: rows.map((row) => ({ year: `'${String(row.fiscal_year).slice(2)}`, mt: row.quantity_mt }))
  };
}

app.get('/api/mines', (req, res) => {
  try {
    const { sql, params } = mineFilters(req.query);
    // No limit by default: the map needs every mine. limit/offset still page if given.
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 10000, 10000);
    const offset = Number.parseInt(req.query.offset, 10) || 0;
    const rows = db
      .prepare(`SELECT * FROM v_mines_master${sql} ORDER BY is_sample DESC, mine_name COLLATE NOCASE LIMIT ? OFFSET ?`)
      .all(...params, limit, offset);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM v_mines_master${sql}`).get(...params).n;
    res.json({ success: true, count: rows.length, total, data: rows.map(formatMine) });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// 4. GET /api/mines/:id/dossier & GET /api/mines/:id (Single Detailed Dossier Specification)
app.get(['/api/mines/:id/dossier', '/api/mines/:id'], (req, res, next) => {
  if (req.params.id === 'export') return next();
  try {
    const row = db.prepare('SELECT * FROM v_mines_master WHERE UPPER(mine_id) = ?').get(req.params.id.toUpperCase());
    if (!row) return res.status(404).json({ success: false, error: `Mine ${req.params.id} not found.` });
    const aliases = db.prepare('SELECT alias FROM MINE_ALIAS WHERE mine_id = ? ORDER BY alias').all(row.mine_id).map((a) => a.alias);
    res.json({ success: true, data: { ...formatMine(row), aliases } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. GET /api/mines/export & GET /api/export/csv (Stream CSV Export)
app.get(['/api/mines/export', '/api/export/csv'], (req, res) => {
  try {
    const { sql, params } = mineFilters(req.query);
    const rows = db.prepare(`SELECT * FROM v_mines_master${sql} ORDER BY is_sample DESC, mine_name COLLATE NOCASE`).all(...params);
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
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// 7. POST /api/sql/query (Interactive Read-Only SQL Terminal)
app.post('/api/sql/query', requirePermission('sql'), (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, message: 'SQL query string required.' });
    }

    const trimmed = query.trim();
    const stmt = db.prepare(trimmed);
    // better-sqlite3 knows whether a statement writes; only allow pure reads
    if (!stmt.readonly || !stmt.reader) {
      return res.status(403).json({
        success: false,
        error: 'The SQL console is read-only. Only SELECT, EXPLAIN and read-only PRAGMA queries are allowed.'
      });
    }

    const start = performance.now();
    const rows = stmt.all();
    const durationMs = (performance.now() - start).toFixed(2);

    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    res.json({
      success: true,
      columns,
      rowCount: rows.length,
      executionTimeMs: durationMs,
      rows
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 8. Entity Switcher API Routes (3NF Tables)
app.get('/api/minerals', (req, res) => {
  const rows = db.prepare('SELECT * FROM MINERAL ORDER BY mineral_id ASC').all();
  res.json({ success: true, count: rows.length, data: rows });
});

app.get('/api/locations', (req, res) => {
  const rows = db.prepare('SELECT * FROM LOCATION ORDER BY state, district ASC').all();
  res.json({ success: true, count: rows.length, data: rows });
});

app.get('/api/companies', (req, res) => {
  const rows = db.prepare('SELECT * FROM MINING_COMPANY ORDER BY company_id ASC').all();
  res.json({ success: true, count: rows.length, data: rows });
});

app.get('/api/leases', (req, res) => {
  const rows = db.prepare('SELECT * FROM LEASE ORDER BY valid_till ASC').all();
  res.json({ success: true, count: rows.length, data: rows });
});

app.get('/api/production', (req, res) => {
  const rows = db.prepare('SELECT * FROM PRODUCTION ORDER BY fiscal_year DESC, quantity_mt DESC').all();
  res.json({ success: true, count: rows.length, data: rows });
});

// 9. Analytical Aggregation Routes
app.get('/api/analytics/district-occurrences', (req, res) => {
  const rows = db.prepare('SELECT * FROM v_district_mineral_occurrence').all();
  res.json({ success: true, count: rows.length, data: rows });
});

app.get('/api/analytics/cross-state-production', (req, res) => {
  const rows = db.prepare('SELECT * FROM v_cross_state_production').all();
  res.json({ success: true, count: rows.length, data: rows });
});

app.get('/api/analytics/lease-compliance', (req, res) => {
  const rows = db.prepare('SELECT * FROM v_lease_lifecycle_compliance').all();
  res.json({ success: true, count: rows.length, data: rows });
});

// 10. Health Check Ping
app.get('/api/health', (req, res) => {
  res.json({
    status: 'HEALTHY',
    service: 'MINERVA Mineral Resource Management Backend',
    database: 'SQLite (3NF Normalized)',
    timestamp: new Date().toISOString()
  });
});

// Boot Server when run directly
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  app.listen(PORT, () => {
    console.log(`[MINERVA BACKEND] REST API active on http://localhost:${PORT}`);
  });
}

export default app;

