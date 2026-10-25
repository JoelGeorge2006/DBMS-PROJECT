/**
 * Load the processed mine list into minerva.db (one transaction, re-runnable).
 *   in:  data/processed/candidates.json, data/raw/admin_lookup.json, raw file dates
 *   out: rows in DATA_SOURCE, LOCATION, MINING_COMPANY, MINERAL, MINE, MINE_MINERAL, MINE_ALIAS
 *        data/processed/report.md (mines per state and mineral)
 *
 * Imported mines are upserted by mine_id (OSM-N/W/R..., WD-Q..., CUR-...). Imported
 * mines that are no longer in the candidate list are deleted. Sample records
 * (is_sample = 1) are never touched.
 */
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { migrate } from '../../db/migrate.js';
import { MINERALS } from './minerals.js';
import { pointKey } from './geocode.js';

const ROOT = process.cwd();
const DB_PATH = path.join(ROOT, 'minerva.db');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const SOURCE_ID = { osm: 2, wikidata: 3, curated: 4 };

// Operators whose ownership is public knowledge; anything else is 'Unknown'
const COMPANY_TYPES = [
  [/coal india|bharat coking|central coalfields|eastern coalfields|mahanadi coalfields|northern coalfields|south eastern coalfields|western coalfields|north eastern coalfields|\bcil\b|\bbccl\b|\bccl\b|\becl\b|\bmcl\b|\bncl\b|\bsecl\b|\bwcl\b/i, 'Central PSU'],
  [/nmdc|steel authority|\bsail\b|nlc india|neyveli|moil|hindustan copper|nalco|national aluminium|uranium corporation|kiocl|ntpc/i, 'Central PSU'],
  [/singareni|\bsccl\b|gujarat mineral|\bgmdc\b|odisha mining|\bomc\b|rajasthan state mines|\brsmml\b|mineral development corporation/i, 'State PSU'],
  [/tata steel|hindalco|vedanta|hindustan zinc|jsw|jindal|adani|ultratech|acc |ambuja|essel|sesa/i, 'Private'],
];
// A name matching more than one ownership pattern (e.g. "Tata Steel, Coal India") is left Unknown
function companyType(name) {
  const types = new Set(COMPANY_TYPES.filter(([re]) => re.test(name)).map(([, t]) => t));
  return types.size === 1 ? [...types][0] : 'Unknown';
}

// Spelling variants of the same operator -> one company
const CANONICAL_COMPANY = [
  [/^(south eastern coalfi\w*|secl\b)/i, 'South Eastern Coalfields Limited (SECL)'],
  [/^(eastern coalfi\w*|ecl\b)/i, 'Eastern Coalfields Limited (ECL)'],
  [/^(western coalfi\w*|wcl\b)/i, 'Western Coalfields Limited (WCL)'],
  [/^(central coalfi\w*|ccl\b)/i, 'Central Coalfields Limited (CCL)'],
  [/^(northern coalfi\w*|ncl\b)/i, 'Northern Coalfields Limited (NCL)'],
  [/^(mahanadi coalfi\w*|mcl\b)/i, 'Mahanadi Coalfields Limited (MCL)'],
  [/^(bharat coking coal|bccl\b)/i, 'Bharat Coking Coal Limited (BCCL)'],
  [/^(north eastern coalfi\w*|necl?\b)/i, 'North Eastern Coalfields (NEC)'],
  [/^(singareni|sccl\b)/i, 'Singareni Collieries Company Limited (SCCL)'],
];
const PLACEHOLDER_OPERATOR = /^(unknown|n\/?a|none|illegal|private|-+|\?+)$/i;

function canonicalCompany(raw) {
  const name = String(raw || '').trim();
  if (!name || PLACEHOLDER_OPERATOR.test(name)) return null;
  return CANONICAL_COMPANY.find(([re]) => re.test(name))?.[1] || name;
}

// OSM spells some districts differently from the existing records
const DISTRICT_ALIASES = { Kendujhar: 'Keonjhar', Ballari: 'Bellary' };

function cleanDistrict(d) {
  const name = (d || 'Unknown district').replace(/\s+district$/i, '').trim();
  return DISTRICT_ALIASES[name] || name;
}

function main() {
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  console.log('Schema:', migrate(db));

  const mines = read('data/processed/candidates.json');
  const admin = fs.existsSync(path.join(ROOT, 'data/raw/admin_lookup.json')) ? read('data/raw/admin_lookup.json') : {};
  const osmDate = read('data/raw/osm_mines.json').retrieved?.slice(0, 10) || null;
  const wdDate = read('data/raw/wikidata_mines.json').retrieved?.slice(0, 10) || null;

  const q = {
    source: db.prepare('UPDATE DATA_SOURCE SET retrieved_on = ? WHERE source_id = ?'),
    curatedSource: db.prepare(`INSERT OR IGNORE INTO DATA_SOURCE (source_id, name, url, licence) VALUES
      (4, 'Curated (see each source_url)', NULL, 'Facts compiled from cited public documents')`),
    mineral: db.prepare('INSERT OR IGNORE INTO MINERAL (mineral_name, mineral_type) VALUES (?, ?)'),
    mineralId: db.prepare('SELECT mineral_id FROM MINERAL WHERE mineral_name = ?'),
    location: db.prepare('SELECT location_id FROM LOCATION WHERE state = ? AND district = ?'),
    addLocation: db.prepare('INSERT INTO LOCATION (state, district, craton_region, latitude, longitude) VALUES (?, ?, NULL, ?, ?)'),
    companies: db.prepare('SELECT company_id, company_name FROM MINING_COMPANY'),
    addCompany: db.prepare("INSERT INTO MINING_COMPANY (company_name, company_type, registered_office) VALUES (?, ?, NULL)"),
    upsertMine: db.prepare(`
      INSERT INTO MINE (mine_id, mine_name, location_id, company_id, lease_id, status, mine_type, latitude, longitude,
                        location_precision, source_id, source_ref, source_url, is_sample)
      VALUES (@mine_id, @mine_name, @location_id, @company_id, NULL, @status, @mine_type, @lat, @lng,
              @precision, @source_id, @source_ref, @source_url, 0)
      ON CONFLICT(mine_id) DO UPDATE SET
        mine_name = excluded.mine_name, location_id = excluded.location_id, company_id = excluded.company_id,
        status = excluded.status, mine_type = excluded.mine_type, latitude = excluded.latitude,
        longitude = excluded.longitude, location_precision = excluded.location_precision,
        source_id = excluded.source_id, source_ref = excluded.source_ref, source_url = excluded.source_url
      WHERE MINE.is_sample = 0`),
    clearMinerals: db.prepare('DELETE FROM MINE_MINERAL WHERE mine_id = ?'),
    addMineral: db.prepare('INSERT OR IGNORE INTO MINE_MINERAL (mine_id, mineral_id, is_primary, ore_grade_description) VALUES (?, ?, ?, ?)'),
    unusedCompanies: db.prepare(`DELETE FROM MINING_COMPANY WHERE company_id NOT IN (SELECT company_id FROM MINE WHERE company_id IS NOT NULL)
        AND company_id NOT IN (SELECT company_id FROM LEASE)`),
    clearAliases: db.prepare('DELETE FROM MINE_ALIAS WHERE mine_id = ?'),
    addAlias: db.prepare('INSERT OR IGNORE INTO MINE_ALIAS (mine_id, alias) VALUES (?, ?)'),
    imported: db.prepare('SELECT mine_id FROM MINE WHERE is_sample = 0'),
    deleteMine: db.prepare('DELETE FROM MINE WHERE mine_id = ? AND is_sample = 0'),
    recentre: db.prepare(`UPDATE LOCATION SET
        latitude = (SELECT AVG(latitude) FROM MINE WHERE MINE.location_id = LOCATION.location_id),
        longitude = (SELECT AVG(longitude) FROM MINE WHERE MINE.location_id = LOCATION.location_id)
      WHERE location_id = ?`),
    unusedLocations: db.prepare(`DELETE FROM LOCATION WHERE location_id NOT IN (SELECT location_id FROM MINE)
        AND craton_region IS NULL`),
  };

  const stats = { inserted: 0, updated: 0, deleted: 0, locations: 0, companies: 0 };

  db.transaction(() => {
    q.source.run(osmDate, 2);
    q.source.run(wdDate, 3);
    if (mines.some((m) => m.source === 'curated')) q.curatedSource.run();

    Object.values(MINERALS).forEach((m) => q.mineral.run(m.name, m.type));

    const companyByName = new Map(q.companies.all().map((c) => [c.company_name.toLowerCase(), c.company_id]));
    const companyId = (raw) => {
      const name = canonicalCompany(raw);
      if (!name) return null;
      const key = name.toLowerCase();
      if (!companyByName.has(key)) {
        companyByName.set(key, Number(q.addCompany.run(name, companyType(name)).lastInsertRowid));
        stats.companies++;
      }
      return companyByName.get(key);
    };

    const newLocations = new Set();
    const locationId = (state, district, lat, lng) => {
      const row = q.location.get(state, district);
      if (row) return row.location_id;
      const id = Number(q.addLocation.run(state, district, lat, lng).lastInsertRowid);
      newLocations.add(id);
      stats.locations++;
      return id;
    };

    const existing = new Set(q.imported.all().map((r) => r.mine_id));
    const seen = new Set();

    for (const m of mines) {
      const hit = admin[pointKey(m.lat, m.lng)] || {};
      const state = m.state || hit.state || 'Unknown state';
      const district = cleanDistrict(m.district || hit.district);
      const mineralName = m.mineral_name;
      const row = {
        mine_id: m.mine_id,
        mine_name: m.name || (mineralName ? `Unnamed ${mineralName.toLowerCase()} mine` : 'Unnamed mine'),
        location_id: locationId(state, district, m.lat, m.lng),
        company_id: companyId(m.operator),
        status: m.status,
        mine_type: m.mine_type,
        lat: m.lat,
        lng: m.lng,
        precision: m.precision,
        source_id: SOURCE_ID[m.source],
        source_ref: m.source_ref,
        source_url: m.source_url,
      };
      q.upsertMine.run(row);
      stats[existing.has(m.mine_id) ? 'updated' : 'inserted']++;
      seen.add(m.mine_id);

      q.clearMinerals.run(m.mine_id);
      (m.mineral_names || (mineralName ? [mineralName] : [])).forEach((name, i) => {
        const note = i === 0 && m.mineral_inferred === 'operator' ? 'Mineral inferred from the operator' : null;
        q.addMineral.run(m.mine_id, q.mineralId.get(name).mineral_id, i === 0 ? 1 : 0, note);
      });
      q.clearAliases.run(m.mine_id);
      m.aliases.forEach((a) => q.addAlias.run(m.mine_id, a));
    }

    for (const id of existing) {
      if (!seen.has(id)) {
        q.deleteMine.run(id);
        stats.deleted++;
      }
    }

    // A district created by the import is placed at the mean of its mines
    newLocations.forEach((id) => q.recentre.run(id));
    q.unusedLocations.run();
    q.unusedCompanies.run();

    const broken = db.pragma('foreign_key_check');
    if (broken.length) throw new Error(`Foreign key check failed: ${JSON.stringify(broken.slice(0, 3))}`);
  })();

  writeReport(db);
  console.log('Load:', stats);
  db.close();
}

function writeReport(db) {
  const rows = db.prepare(`
    SELECT l.state, COALESCE(mn.mineral_name, 'Not recorded') AS mineral, COUNT(*) AS n
    FROM MINE m JOIN LOCATION l ON l.location_id = m.location_id
    LEFT JOIN MINE_MINERAL mm ON mm.mine_id = m.mine_id AND mm.is_primary = 1
    LEFT JOIN MINERAL mn ON mn.mineral_id = mm.mineral_id
    GROUP BY l.state, mineral ORDER BY l.state, n DESC`).all();
  const totals = db.prepare(`
    SELECT ds.name AS source, COUNT(*) AS n FROM MINE m JOIN DATA_SOURCE ds ON ds.source_id = m.source_id
    GROUP BY ds.name ORDER BY n DESC`).all();
  const byState = new Map();
  rows.forEach((r) => {
    if (!byState.has(r.state)) byState.set(r.state, []);
    byState.get(r.state).push(r);
  });
  const total = totals.reduce((s, t) => s + t.n, 0);
  const lines = [
    '# Mine import report',
    '',
    `Generated ${new Date().toISOString().slice(0, 10)} by \`npm run import:mines\`. ${total} mines in minerva.db.`,
    '',
    '| Source | Mines |',
    '|---|---|',
    ...totals.map((t) => `| ${t.source} | ${t.n} |`),
    '',
    '| State | Mines | By mineral |',
    '|---|---|---|',
    ...[...byState.entries()]
      .sort((a, b) => b[1].reduce((s, r) => s + r.n, 0) - a[1].reduce((s, r) => s + r.n, 0))
      .map(([state, list]) => `| ${state} | ${list.reduce((s, r) => s + r.n, 0)} | ${list.map((r) => `${r.mineral} ${r.n}`).join(', ')} |`),
    '',
  ];
  fs.writeFileSync(path.join(ROOT, 'data/processed/report.md'), lines.join('\n'));
  console.log(lines.slice(4, 4 + totals.length + 2).join('\n'));
}

main();
