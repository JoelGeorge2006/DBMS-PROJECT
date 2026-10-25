/**
 * Schema migrations for minerva.db (PRAGMA user_version tracks the version).
 *
 * v1 -> v2: rebuild every table with the v2 DDL from schema.sql and copy the
 * existing rows across. v1 rows are the synthetic sample records, so they are
 * tagged is_sample = 1 with source "MINERVA sample data".
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureDemoUsers } from '../lib/auth.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_PATH = path.join(ROOT, 'schema.sql');
const SEED_MARKER = '-- 7. SEED DATA';

export const SCHEMA_VERSION = 4;

/** The users/sessions block of schema.sql (v3), all CREATE ... IF NOT EXISTS */
/** A marked block of schema.sql (e.g. AUTH, SEARCH), all CREATE ... IF NOT EXISTS */
function ddlBlock(name) {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const start = sql.indexOf(`-- ${name} BEGIN`);
  const end = sql.indexOf(`-- ${name} END`);
  if (start === -1 || end === -1) throw new Error(`schema.sql has no ${name} block`);
  return sql.slice(start, end);
}

function migrateV3toV4(db) {
  db.transaction(() => {
    db.exec(ddlBlock('SEARCH'));
    db.pragma('user_version = 4');
  })();
}

function migrateV2toV3(db) {
  db.transaction(() => {
    db.exec(ddlBlock('AUTH'));
    db.exec(ddlBlock('SEARCH'));
    db.pragma('user_version = 4');
  })();
}

/** The DDL half of schema.sql (everything before the seed data) */
function v2Ddl() {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const at = sql.indexOf(SEED_MARKER);
  if (at === -1) throw new Error(`schema.sql has no "${SEED_MARKER}" section`);
  return sql.slice(0, sql.lastIndexOf('\n-- ---', at));
}

const DATA_SOURCES = [
  [1, 'MINERVA sample data', null, 'Synthetic demonstration data, not official statistics', null],
  [2, 'OpenStreetMap', 'https://www.openstreetmap.org/copyright', 'ODbL 1.0 (© OpenStreetMap contributors)', null],
  [3, 'Wikidata', 'https://www.wikidata.org', 'CC0 1.0', null],
];

function migrateV1toV2(db) {
  const read = (table) => db.prepare(`SELECT * FROM ${table}`).all();
  const old = {
    LOCATION: read('LOCATION'),
    MINING_COMPANY: read('MINING_COMPANY'),
    LEASE: read('LEASE'),
    MINERAL: read('MINERAL'),
    MINE: read('MINE'),
    MINE_MINERAL: read('MINE_MINERAL'),
    PRODUCTION: read('PRODUCTION'),
  };

  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(v2Ddl());
      const ins = (sql, rows, map) => {
        const stmt = db.prepare(sql);
        rows.forEach((r) => stmt.run(map(r)));
      };
      ins('INSERT INTO DATA_SOURCE (source_id, name, url, licence, retrieved_on) VALUES (?, ?, ?, ?, ?)', DATA_SOURCES, (r) => r);
      ins('INSERT INTO LOCATION (location_id, state, district, craton_region, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?)',
        old.LOCATION, (r) => [r.location_id, r.state, r.district, r.craton_region, r.latitude, r.longitude]);
      ins('INSERT INTO MINING_COMPANY (company_id, company_name, company_type, registered_office) VALUES (?, ?, ?, ?)',
        old.MINING_COMPANY, (r) => [r.company_id, r.company_name, r.company_type, r.registered_office]);
      ins(`INSERT INTO LEASE (lease_id, company_id, execution_date, valid_till, royalty_rate_pct, lease_area_hectares, forest_clearance_stage, cto_valid_till)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        old.LEASE, (r) => [r.lease_id, r.company_id, r.execution_date, r.valid_till, r.royalty_rate_pct, r.lease_area_hectares, r.forest_clearance_stage, r.cto_valid_till]);
      ins(`INSERT INTO MINERAL (mineral_id, mineral_name, mineral_type, fe_pct, sio2_pct, al2o3_pct, phosphorus_pct, moisture_pct)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        old.MINERAL, (r) => [r.mineral_id, r.mineral_name, r.mineral_type, r.fe_pct, r.sio2_pct, r.al2o3_pct, r.phosphorus_pct, r.moisture_pct]);
      ins(`INSERT INTO MINE (mine_id, mine_name, location_id, company_id, lease_id, status, latitude, longitude, source_id, is_sample)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
        old.MINE, (r) => [r.mine_id, r.mine_name, r.location_id, r.company_id, r.lease_id, r.status, r.latitude, r.longitude]);
      ins('INSERT INTO MINE_MINERAL (mine_id, mineral_id, is_primary, ore_grade_description) VALUES (?, ?, ?, ?)',
        old.MINE_MINERAL, (r) => [r.mine_id, r.mineral_id, r.is_primary, r.ore_grade_description]);
      ins('INSERT INTO PRODUCTION (prod_id, mine_id, mineral_id, fiscal_year, quantity_mt, dispatch_mt) VALUES (?, ?, ?, ?, ?, ?)',
        old.PRODUCTION, (r) => [r.prod_id, r.mine_id, r.mineral_id, r.fiscal_year, r.quantity_mt, r.dispatch_mt]);

      const broken = db.pragma('foreign_key_check');
      if (broken.length) throw new Error(`Foreign key check failed after migration: ${JSON.stringify(broken.slice(0, 3))}`);
      db.pragma('user_version = 4');
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

/**
 * Recreate the R*Tree triggers from schema.sql and rebuild the index if it has
 * drifted from MINE. Cheap, so it runs on every start: fixes to the trigger
 * definitions then reach existing databases too.
 */
function ensureSpatialIndex(db) {
  const ddl = v2Ddl();
  const triggers = ddl.match(/CREATE TRIGGER trg_mine_rtree_[\s\S]*?END;/g) || [];
  db.transaction(() => {
    triggers.forEach((sql) => {
      const name = sql.match(/CREATE TRIGGER (\w+)/)[1];
      db.exec(`DROP TRIGGER IF EXISTS ${name}; ${sql}`);
    });
    const mines = db.prepare('SELECT COUNT(*) AS n FROM MINE').get().n;
    const indexed = db.prepare('SELECT COUNT(*) AS n FROM MINE_RTREE WHERE id IN (SELECT rowid FROM MINE)').get().n;
    const total = db.prepare('SELECT COUNT(*) AS n FROM MINE_RTREE').get().n;
    if (mines !== indexed || total !== indexed) {
      db.exec(`DELETE FROM MINE_RTREE;
        INSERT INTO MINE_RTREE (id, min_lng, max_lng, min_lat, max_lat)
        SELECT rowid, longitude, longitude, latitude, latitude FROM MINE;`);
    }
  })();
}

/** Bring the database up to SCHEMA_VERSION. Returns a short description of what happened. */
export function migrate(db) {
  const result = migrateSchema(db);
  ensureSpatialIndex(db);
  const seeded = ensureDemoUsers(db);
  return seeded ? `${result}, ${seeded} demo users added` : result;
}

function migrateSchema(db) {
  const hasMine = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'MINE'").get();
  if (!hasMine) {
    db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    return 'created from schema.sql';
  }
  const version = db.pragma('user_version', { simple: true });
  if (version >= SCHEMA_VERSION) return `schema v${version}`;
  // v1 -> v2 rebuilds every table with the current DDL, which already includes v3 and v4
  if (version <= 1) migrateV1toV2(db);
  else if (version === 2) migrateV2toV3(db);
  else if (version === 3) migrateV3toV4(db);
  return `migrated v${version} -> v${SCHEMA_VERSION}`;
}
