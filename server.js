/**
 * MINERVA — National Mineral Geospatial Intelligence Grid
 * Course: BACSE202 - Database Systems
 * Backend REST API Service (Node.js, Express, better-sqlite3)
 */

import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { BinarySearchTree } from './dsa/BinarySearchTree.js';
import { buildNearestNeighbourGraph, buildCompleteGraph, dijkstra } from './dsa/Dijkstra.js';
import { primMST, kruskalMST } from './dsa/MST.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'minerva.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

app.use(cors());
app.use(express.json());

// ============================================================================
// 1. Database Connection & Schema Bootstrapping
// ============================================================================
let db;
try {
  db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  // Verify database has tables; if empty, initialize from schema.sql
  const checkTable = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='MINE'").get();
  if (!checkTable || checkTable.count === 0) {
    console.log('[MINERVA DB] Database not initialized. Executing schema.sql...');
    const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schemaSql);
    console.log('[MINERVA DB] Schema and seed data successfully initialized.');
  } else {
    console.log('[MINERVA DB] Connected to existing SQLite database at:', DB_PATH);
  }
} catch (err) {
  console.error('[MINERVA DB] Fatal database error:', err);
  process.exit(1);
}

// ============================================================================
// 2. Archival Publications Dataset
// ============================================================================
const ARCHIVAL_PUBLICATIONS = [
  {
    id: 'PUB-2026-01',
    title: 'Annual Iron Ore Production & Dispatch Ledger',
    jurisdiction: 'Odisha (Keonjhar)',
    period: 'FY 2025–26',
    meta: 'Odisha (Keonjhar)  •  FY 2025–26',
    status: 'VERIFIED',
    registryNo: 'IBM/PUB/2026/041',
    date: '15 Jan 2026',
    pages: 42,
    size: '4.8 MB',
    format: 'PDF',
    hash: 'SHA-256: 8f4c2e11d08b3a76295e87a2741d4c9f182e0b55291a45778b4097f4c519d08e',
    summary: 'Audited gross production, grade distribution (64.2% Fe Hematite), environmental dispatch permits, and royalty remittances for the Keonjhar Iron Ore Sector.',
    metrics: [
      { key: 'Gross Extracted Output', val: '48.20 Million Metric Tonnes' },
      { key: 'Dispatch Clearance Pass', val: '100% Biometric e-Transit Pass Verified' },
      { key: 'Net Royalty Remittance', val: '₹1,420.84 Crores to State Treasury' },
      { key: 'Regulatory Compliance', val: '99.8% IBM Benchmark Index' }
    ]
  },
  {
    id: 'PUB-2026-02',
    title: 'Concession Validity & Expiry Timeline Review',
    jurisdiction: 'Pan-India',
    period: 'Q2 2026',
    meta: 'Pan-India  •  Q2 2026',
    status: 'VERIFIED',
    registryNo: 'IBM/PUB/2026/028',
    date: '02 Apr 2026',
    pages: 68,
    size: '6.2 MB',
    format: 'PDF',
    hash: 'SHA-256: 3c91a0f8b172d54e8910b271c4801e9564f20b33481e19488b1937f2a410b91e',
    summary: 'National audit of 842 major mineral concessions under Section 8A of the MMDR Act, flagging upcoming 2030 auction transitions and compliance clearances.',
    metrics: [
      { key: 'Audited Concession Leases', val: '842 Active Major Mineral Leases' },
      { key: 'Expiring Within 5-Yr Cycle', val: '42 Concessions Scheduled for Re-Auction' },
      { key: 'Protected Compliant Leases', val: '780 Compliant Leases Protected' },
      { key: 'Reconciliation Status', val: 'National Registry Cleared' }
    ]
  },
  {
    id: 'PUB-2025-03',
    title: 'Copper & Multi-Metal Reserve Extraction Index',
    jurisdiction: 'Rajasthan (Khetri)',
    period: 'Bi-Annual 2025',
    meta: 'Rajasthan (Khetri)  •  Bi-Annual 2025',
    status: 'VERIFIED',
    registryNo: 'IBM/PUB/2025/119',
    date: '18 Nov 2025',
    pages: 36,
    size: '3.9 MB',
    format: 'PDF',
    hash: 'SHA-256: 9b2d8e41f776a301c54e2098d519a4f1082e5b77821034f19b4820a1c4918e20',
    summary: 'Sub-surface geological extraction log, chalcopyrite ore beneficiation yields, underground shaft structural monitoring, and tailings pond safety compliance.',
    metrics: [
      { key: 'Processed Copper Ore', val: '18,450 Metric Tonnes (2.4% Cu Grade)' },
      { key: 'Smelter Recovery Ratio', val: '94.2% Theoretical Recovery' },
      { key: 'Underground Active Shafts', val: '4 Fully Monitored Shafts' },
      { key: 'Tailings Stability Index', val: 'Zero-Seepage Certified' }
    ]
  },
  {
    id: 'PUB-2025-04',
    title: 'Bauxite Lease Boundary & Buffer Overlap Report',
    jurisdiction: 'Odisha (Koraput)',
    period: 'Annual 2025',
    meta: 'Odisha (Koraput)  •  Annual 2025',
    status: 'VERIFIED',
    registryNo: 'IBM/PUB/2025/084',
    date: '10 Dec 2025',
    pages: 54,
    size: '5.4 MB',
    format: 'PDF',
    hash: 'SHA-256: 1a5e98f24c30b881d763e002c918a4f5619e0b112093847781b047a2c5108491',
    summary: 'DGPS and satellite cadastral boundary verification over the Panchpatmali bauxite plateau, validating 50-meter buffer demarcations against tribal and forest reserves.',
    metrics: [
      { key: 'DGPS Validated Area', val: '1,845.00 Hectares (Panchpatmali Ridge)' },
      { key: 'Boundary Pillars Checked', val: '100% Boundary Pillars Georeferenced' },
      { key: 'Buffer Zone Verification', val: 'Zero Encroachment Beyond Concession' },
      { key: 'Environmental Status', val: 'Stage-II Forest Clearance Compliant' }
    ]
  },
  {
    id: 'PUB-2025-05',
    title: 'Cross-State Mineral Royalty Collection Reconciliation',
    jurisdiction: 'Karnataka & Chhattisgarh',
    period: 'FY 2024–25',
    meta: 'Karnataka & Chhattisgarh  •  FY 2024–25',
    status: 'VERIFIED',
    registryNo: 'IBM/PUB/2025/002',
    date: '28 Mar 2025',
    pages: 82,
    size: '8.1 MB',
    format: 'PDF',
    hash: 'SHA-256: 7e3f1c99b820a443d018e652a9104b51829e0b44319482778a40291fc5182910',
    summary: 'Tripartite inter-state reconciliation report covering District Mineral Foundation (DMF) and National Mineral Exploration Trust (NMET) cess disbursements.',
    metrics: [
      { key: 'Reconciled Royalty Amount', val: '₹2,845.60 Crores Reconciled' },
      { key: 'DMF Welfare Allocation', val: '₹1,980.20 Crores to Mining Districts' },
      { key: 'NMET Exploration Fund', val: '₹142.28 Crores for Greenfield Basins' },
      { key: 'Audit Discrepancy Margin', val: '0.00% (Full Settlement Verified)' }
    ]
  }
];

// ============================================================================
// 3. REST API ENDPOINTS
// ============================================================================

// 1. GET /api/kpi/metrics (Dashboard Telemetry Counters)
app.get('/api/kpi/metrics', (req, res) => {
  try {
    const activeMinesRow = db.prepare("SELECT count(*) as count FROM MINE WHERE status != 'Revoked'").get();
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

// 2. GET /api/gis/nodes (Geospatial Telemetry Nodes & Clusters)
app.get('/api/gis/nodes', (req, res) => {
  try {
    const { mineral, state, district, show_mines, show_hotspots, show_leases } = req.query;

    let query = `
      SELECT 
        m.mine_id AS id,
        m.mine_name AS name,
        l.state,
        l.district,
        m.latitude,
        m.longitude,
        c.company_name AS company,
        min.mineral_name AS mineral,
        min.mineral_type AS mineralCategory,
        ('LEASE: ' || le.lease_id) AS leaseId,
        (p.quantity_mt || 'M MT/Yr') AS yield,
        m.status,
        l.craton_region AS craton,
        CASE 
          WHEN min.mineral_name LIKE '%Iron%' THEN 'amber'
          WHEN min.mineral_name LIKE '%Copper%' THEN 'copper'
          WHEN min.mineral_name LIKE '%Bauxite%' THEN 'amber'
          ELSE 'copper'
        END AS colorType,
        CASE
          WHEN m.mine_id = 'MN-0182' THEN 50
          WHEN m.mine_id = 'MN-0294' THEN 83
          WHEN m.mine_id = 'MN-0411' THEN 48
          WHEN m.mine_id = 'MN-0523' THEN 51
          WHEN m.mine_id = 'MN-0887' THEN 38
          WHEN m.mine_id = 'MN-1104' THEN 44
          WHEN m.mine_id = 'MN-1248' THEN 62
          ELSE 45
        END AS count,
        50 AS sensorsOnline
      FROM MINE m
      JOIN LOCATION l ON m.location_id = l.location_id
      JOIN MINING_COMPANY c ON m.company_id = c.company_id
      JOIN LEASE le ON m.lease_id = le.lease_id
      JOIN MINE_MINERAL mm ON m.mine_id = mm.mine_id AND mm.is_primary = 1
      JOIN MINERAL min ON mm.mineral_id = min.mineral_id
      LEFT JOIN PRODUCTION p ON m.mine_id = p.mine_id AND p.fiscal_year = 2024
      WHERE 1=1
    `;

    const params = [];

    if (mineral && mineral !== 'ALL') {
      query += ` AND min.mineral_name LIKE ?`;
      params.push(`%${mineral}%`);
    }

    if (state && state !== 'ALL') {
      query += ` AND l.state = ?`;
      params.push(state);
    }

    if (district && district !== 'ALL') {
      query += ` AND l.district = ?`;
      params.push(district);
    }

    const rows = db.prepare(query).all(...params);

    const formattedNodes = rows.map((r) => ({
      ...r,
      coords: [r.latitude, r.longitude]
    }));

    // Bounding Box Polygons for Concessions
    const leasePolygons = formattedNodes.map((n) => {
      const lat = n.coords[0];
      const lng = n.coords[1];
      const delta = 0.045;
      return {
        id: `POLY-${n.id}`,
        name: `${n.name} Cadastral Zone`,
        coordinates: [
          [lat - delta * 0.7, lng - delta],
          [lat + delta * 0.9, lng - delta * 0.5],
          [lat + delta, lng + delta * 0.8],
          [lat - delta * 0.8, lng + delta]
        ]
      };
    });

    res.json({
      success: true,
      count: formattedNodes.length,
      nodes: formattedNodes,
      leasePolygons: show_leases === 'false' ? [] : leasePolygons
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. GET /api/mines (Master Grid with Query Filters & Search)
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
    const { search, state, mineral, status, limit = 50, offset = 0 } = req.query;

    let query = `SELECT * FROM v_mines_master WHERE 1=1`;
    const params = [];

    if (state && state !== 'ALL') {
      query += ` AND state = ?`;
      params.push(state);
    }

    if (mineral && mineral !== 'ALL') {
      query += ` AND (primary_mineral LIKE ? OR ore_grade_description LIKE ?)`;
      params.push(`%${mineral}%`, `%${mineral}%`);
    }

    if (status && status !== 'ALL') {
      query += ` AND status = ?`;
      params.push(status);
    }

    if (search) {
      query += ` AND (
        mine_id LIKE ? OR 
        mine_name LIKE ? OR 
        primary_mineral LIKE ? OR 
        state_district LIKE ? OR 
        operating_lessee LIKE ? OR 
        lease_id LIKE ?
      )`;
      const q = `%${search}%`;
      params.push(q, q, q, q, q, q);
    }

    query += ` ORDER BY mine_id ASC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const rows = db.prepare(query).all(...params);

    // Format for frontend consumption
    const formatted = rows.map((r) => {
      let mineralDotColor = 'rust';
      if (r.primary_mineral.toLowerCase().includes('copper')) mineralDotColor = 'teal';
      else if (r.primary_mineral.toLowerCase().includes('bauxite')) mineralDotColor = 'amber';
      else if (r.primary_mineral.toLowerCase().includes('chromite')) mineralDotColor = 'brown';
      else if (r.primary_mineral.toLowerCase().includes('lead') || r.primary_mineral.toLowerCase().includes('zinc')) mineralDotColor = 'gray';

      let statusClass = 'operational';
      if (r.status === 'Under Maintenance') statusClass = 'maintenance';
      else if (r.status === 'Expiring') statusClass = 'expiring';

      return {
        mineId: r.mine_id,
        mineName: r.mine_name,
        primaryMineral: r.primary_mineral,
        mineralCategory: r.mineral_type,
        mineralDotColor,
        state: r.state,
        district: r.district,
        stateDistrict: r.state_district,
        operatingLessee: r.operating_lessee,
        leaseValidity: r.lease_validity,
        status: r.status,
        statusClass,
        coords: [r.latitude, r.longitude],
        dossier: {
          category: 'DETAIL DOSSIER',
          fullName: `${r.mine_name} (${r.mine_id})`,
          assay: {
            fe: `${r.fe_pct}%`,
            sio2: `${r.sio2_pct}%`,
            al2o3: `${r.al2o3_pct}%`,
            phosphorus: `${r.phosphorus_pct}%`,
            moisture: `${r.moisture_pct}%`
          },
          lease: {
            id: r.lease_id,
            executed: r.execution_date,
            validTill: r.valid_till,
            royaltyRate: r.royalty_rate,
            area: r.area_formatted
          },
          production: productionSummary(r.mine_id),
          clearance: {
            title: r.forest_clearance_stage,
            subtitle: `Approved • CTO Valid till ${r.cto_valid_till.substring(0, 4)}`,
            approved: r.status !== 'Under Maintenance' && r.status !== 'Revoked'
          }
        }
      };
    });

    res.json({
      success: true,
      count: formatted.length,
      data: formatted
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. GET /api/mines/:id/dossier & GET /api/mines/:id (Single Detailed Dossier Specification)
app.get(['/api/mines/:id/dossier', '/api/mines/:id'], (req, res, next) => {
  if (req.params.id === 'export') return next();
  try {

    const mineId = req.params.id.toUpperCase();
    const row = db.prepare(`SELECT * FROM v_mines_master WHERE UPPER(mine_id) = ?`).get(mineId);

    if (!row) {
      return res.status(404).json({ success: false, message: `Mine with ID ${mineId} not found.` });
    }

    // Fetch multi-year production history
    const prodRows = db
      .prepare(`SELECT fiscal_year, quantity_mt, dispatch_mt FROM PRODUCTION WHERE mine_id = ? ORDER BY fiscal_year ASC`)
      .all(row.mine_id);

    const history = prodRows.map((p) => ({
      year: `'${String(p.fiscal_year).substring(2)}`,
      mt: p.quantity_mt,
      dispatchMt: p.dispatch_mt
    }));

    const dossier = {
      mineId: row.mine_id,
      mineName: row.mine_name,
      fullName: `${row.mine_name} (${row.mine_id})`,
      category: 'DETAIL DOSSIER',
      assay: {
        fe: `${row.fe_pct}%`,
        sio2: `${row.sio2_pct}%`,
        al2o3: `${row.al2o3_pct}%`,
        phosphorus: `${row.phosphorus_pct}%`,
        moisture: `${row.moisture_pct}%`
      },
      lease: {
        id: row.lease_id,
        executed: row.execution_date,
        validTill: row.valid_till,
        royaltyRate: row.royalty_rate,
        area: row.area_formatted
      },
      production: {
        currentOutput: row.current_output_formatted,
        history
      },
      clearance: {
        title: row.forest_clearance_stage,
        subtitle: `Approved • CTO Valid till ${row.cto_valid_till.substring(0, 4)}`,
        approved: row.status !== 'Under Maintenance' && row.status !== 'Revoked'
      },
      coords: [row.latitude, row.longitude]
    };

    res.json({ success: true, data: dossier });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. GET /api/mines/export & GET /api/export/csv (Stream CSV Export)
app.get(['/api/mines/export', '/api/export/csv'], (req, res) => {
  try {
    const { state, mineral, status, search } = req.query;

    let query = `SELECT * FROM v_mines_master WHERE 1=1`;
    const params = [];

    if (state && state !== 'ALL') {
      query += ` AND state = ?`;
      params.push(state);
    }
    if (mineral && mineral !== 'ALL') {
      query += ` AND primary_mineral LIKE ?`;
      params.push(`%${mineral}%`);
    }
    if (status && status !== 'ALL') {
      query += ` AND status = ?`;
      params.push(status);
    }
    if (search) {
      query += ` AND (mine_id LIKE ? OR mine_name LIKE ? OR primary_mineral LIKE ? OR operating_lessee LIKE ?)`;
      const q = `%${search}%`;
      params.push(q, q, q, q);
    }

    const rows = db.prepare(query).all(...params);

    const headers = 'MINE ID,MINE NAME,PRIMARY MINERAL,STATE & DISTRICT,OPERATING LESSEE,LEASE VALIDITY,STATUS\n';
    const csvContent = rows
      .map(
        (m) =>
          `"${m.mine_id}","${m.mine_name}","${m.primary_mineral}","${m.state_district}","${m.operating_lessee}","${m.lease_validity}","${m.status}"`
      )
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="MINERVA_Mines_Master_Export.csv"');
    res.send(headers + csvContent);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. GET /api/reports & GET /api/reports/:id/download (Archival Publications)
app.get('/api/reports', (req, res) => {
  res.json({
    success: true,
    count: ARCHIVAL_PUBLICATIONS.length,
    data: ARCHIVAL_PUBLICATIONS
  });
});

app.get('/api/reports/:id/download', (req, res) => {
  const pubId = req.params.id.toUpperCase();
  const found = ARCHIVAL_PUBLICATIONS.find((p) => p.id.toUpperCase() === pubId);

  if (!found) {
    return res.status(404).json({ success: false, message: 'Archival report not found.' });
  }

  const content = `========================================================================
MINERVA — NATIONAL MINERAL GEOSPATIAL ARCHIVE
MINISTRY OF MINES • INDIAN BUREAU OF MINES REGISTRY
========================================================================
Document:           ${found.title}
Serial Registry:    ${found.registryNo}
Jurisdiction:       ${found.jurisdiction}
Accounting Period:  ${found.period}
Tamper Hash:        ${found.hash}
Statutory Status:   ${found.status} (Verified under MMDR Act Sec. 8A)
Total Pages:        ${found.pages}
Archival Date:      ${found.date}

------------------------------------------------------------------------
EXECUTIVE SUMMARY & STATUTORY FINDINGS
------------------------------------------------------------------------
${found.summary}

------------------------------------------------------------------------
AUDIT LEDGER METRICS
------------------------------------------------------------------------
${found.metrics.map((m) => `* ${m.key.padEnd(28)}: ${m.val}`).join('\n')}

========================================================================
Digitally Signed by Director General, Indian Bureau of Mines (Nagpur HQ)
WGS84 Geospatial Reference Registry • All Rights Reserved
========================================================================
`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="MINERVA_${found.id}_${found.title.replace(/\s+/g, '_')}.txt"`);
  res.send(content);
});

// Alias for backward compatibility
app.get('/api/publications', (req, res) => res.redirect('/api/reports'));
app.get('/api/publications/:id/download', (req, res) => res.redirect(`/api/reports/${req.params.id}/download`));

// 7. POST /api/sql/query (Interactive Read-Only SQL Terminal)
app.post('/api/sql/query', (req, res) => {
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

// DSA: BST range search over mineral assay values
const BST_ATTRIBUTES = { fe_pct: 'Fe', sio2_pct: 'SiO2', al2o3_pct: 'Al2O3' };

app.get('/api/dsa/bst/range', (req, res) => {
  const attr = BST_ATTRIBUTES[req.query.attr] ? req.query.attr : 'fe_pct';
  const min = Number(req.query.min ?? 0);
  const max = Number(req.query.max ?? 100);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
    return res.status(400).json({ success: false, error: 'min and max must be numbers with min <= max.' });
  }

  // Insert in primary-key order, as rows come out of the table
  const minerals = db.prepare('SELECT * FROM MINERAL ORDER BY mineral_id').all();
  const tree = new BinarySearchTree();
  minerals.forEach((m) => tree.insert(m[attr] ?? 0, m));

  const { results, visited } = tree.rangeQuery(min, max);
  const linear = BinarySearchTree.linearRangeSearch(minerals, min, max, (m) => m[attr] ?? 0);

  res.json({
    success: true,
    attribute: attr,
    attributeLabel: BST_ATTRIBUTES[attr],
    min,
    max,
    size: tree.size(),
    height: tree.height(),
    tree: tree.toJSON((n) => n.data.mineral_name),
    visited,
    matches: results.map((n) => ({ id: n.id, key: n.key, mineral: n.data })),
    bstComparisons: visited.length,
    linearComparisons: linear.comparisons
  });
});

// DSA: mine transport network (each mine linked to its 3 nearest mines)
const CORRIDOR_NEIGHBOURS = 3;

function loadMineGraph() {
  const mines = db.prepare(`
    SELECT m.mine_id AS id, m.mine_name AS name, m.status, l.state, l.district,
           m.latitude AS lat, m.longitude AS lng
    FROM MINE m JOIN LOCATION l ON l.location_id = m.location_id
    ORDER BY m.mine_id
  `).all();
  return { mines, graph: buildNearestNeighbourGraph(mines, CORRIDOR_NEIGHBOURS) };
}

app.get('/api/dsa/network', (req, res) => {
  const { mines, graph } = loadMineGraph();
  res.json({ success: true, neighbours: CORRIDOR_NEIGHBOURS, nodes: mines, edges: graph.edges() });
});

app.get('/api/dsa/shortest-route', (req, res) => {
  const { from, to } = req.query;
  const { mines, graph } = loadMineGraph();
  const byId = new Map(mines.map((m) => [m.id, m]));
  if (!byId.has(from) || !byId.has(to)) {
    return res.status(400).json({ success: false, error: 'from and to must be valid mine IDs.' });
  }

  const { path, distance, settledOrder } = dijkstra(graph, from, to);
  if (path.length === 0) {
    return res.json({ success: true, reachable: false, path: [], hops: [], distanceKm: null });
  }

  const hops = path.slice(1).map((id, i) => ({
    from: path[i],
    to: id,
    distanceKm: graph.neighbours(path[i]).get(id)
  }));

  res.json({
    success: true,
    reachable: true,
    path: path.map((id) => byId.get(id)),
    hops,
    distanceKm: distance,
    nodesSettled: settledOrder.length
  });
});

// DSA: minimum spanning tree over every pair of mines
app.get('/api/dsa/mst', (req, res) => {
  const algorithm = req.query.algorithm === 'kruskal' ? 'kruskal' : 'prim';
  const { mines } = loadMineGraph();
  const complete = buildCompleteGraph(mines);
  const root = mines.some((m) => m.id === req.query.root) ? req.query.root : mines[0]?.id;

  const result = algorithm === 'kruskal' ? kruskalMST(complete) : primMST(complete, root);
  const allPairsKm = Math.round(complete.edges().reduce((sum, e) => sum + e.weight, 0) * 10) / 10;

  res.json({
    success: true,
    algorithm,
    root: algorithm === 'prim' ? root : null,
    candidateEdges: complete.edges().length,
    edges: result.edges,
    totalKm: result.totalWeight,
    allPairsKm,
    cycleEdgesRejected: result.rejected ?? null
  });
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

