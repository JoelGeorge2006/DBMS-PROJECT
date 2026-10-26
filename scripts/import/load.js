/**
 * Load the processed mine list into the Supabase database (one transaction, re-runnable).
 *   in:  data/processed/candidates.json, data/raw/admin_lookup.json, raw file dates
 *   out: rows in data_source, state, location, mining_company, mineral, mine, mine_mineral, mine_alias
 *        data/processed/report.md (mines per state and mineral)
 *
 * Imported mines are upserted by mine_id (OSM-N/W/R..., WD-Q..., CUR-...). Imported
 * mines that are no longer in the candidate list are deleted. Sample records
 * (is_sample) are never touched. Run npm run db:setup first.
 */
import fs from 'fs';
import path from 'path';
import { getPool, transaction } from '../../db/pool.js';
import { commodityName, stateName } from '../../db/commodities.js';
import { MINERALS } from './minerals.js';
import { pointKey } from './geocode.js';

const ROOT = process.cwd();
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const SOURCE_KEY = { osm: 'osm', wikidata: 'wikidata', curated: 'curated' };

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

async function main() {
  const mines = read('data/processed/candidates.json');
  const admin = fs.existsSync(path.join(ROOT, 'data/raw/admin_lookup.json')) ? read('data/raw/admin_lookup.json') : {};
  const osmDate = read('data/raw/osm_mines.json').retrieved?.slice(0, 10) || null;
  const wdDate = read('data/raw/wikidata_mines.json').retrieved?.slice(0, 10) || null;

  const stats = { inserted: 0, updated: 0, deleted: 0, locations: 0, companies: 0 };

  await transaction(async (c) => {
    const q = (sql, params) => c.query(sql, params);
    // A bulk refresh: keep it out of row_change_log (see fn_log_change in db/schema.sql)
    await q("SELECT set_config('minerva.seeding', 'on', true)");

    await q('UPDATE data_source SET retrieved_on = $1 WHERE source_key = $2', [osmDate, 'osm']);
    await q('UPDATE data_source SET retrieved_on = $1 WHERE source_key = $2', [wdDate, 'wikidata']);
    if (mines.some((m) => m.source === 'curated')) {
      await q(`INSERT INTO data_source (source_key, name, licence) VALUES ('curated', 'Curated (see each source_url)', 'Facts compiled from cited public documents')
        ON CONFLICT (source_key) DO NOTHING`);
    }
    const sourceId = Object.fromEntries((await q('SELECT source_key, source_id FROM data_source')).rows.map((r) => [r.source_key, r.source_id]));

    // Every step below is one set-based statement: row-by-row round trips to a remote
    // database would take minutes. Rows travel as JSON and are unpacked with jsonb_to_recordset.
    await q(`INSERT INTO mineral (mineral_name, mineral_type, commodity_id)
      SELECT x.name, x.type, c.commodity_id FROM jsonb_to_recordset($1) AS x(name text, type text, commodity text)
      JOIN commodity c ON c.commodity_name = x.commodity
      ON CONFLICT (mineral_name) DO NOTHING`,
    [JSON.stringify(Object.values(MINERALS).map((m) => ({ name: m.name, type: m.type, commodity: commodityName(m.name) })))]);
    const mineralId = new Map((await q('SELECT mineral_id, mineral_name FROM mineral')).rows.map((r) => [r.mineral_name, r.mineral_id]));

    // Resolve each mine's state, district and operator first
    const prepared = mines.map((m) => {
      const hit = admin[pointKey(m.lat, m.lng)] || {};
      return { m, state: stateName(m.state || hit.state || 'Unknown state'), district: cleanDistrict(m.district || hit.district), company: canonicalCompany(m.operator) };
    });

    // Companies: add the missing ones
    const companies = [...new Map(prepared.filter((p) => p.company).map((p) => [p.company.toLowerCase(), p.company])).values()];
    const added = await q(`INSERT INTO mining_company (company_name, company_type)
      SELECT x.name, x.type::company_kind FROM jsonb_to_recordset($1) AS x(name text, type text)
      WHERE NOT EXISTS (SELECT 1 FROM mining_company c WHERE lower(c.company_name) = lower(x.name))`,
    [JSON.stringify(companies.map((name) => ({ name, type: companyType(name) })))]);
    stats.companies = added.rowCount;
    const companyByName = new Map((await q('SELECT company_id, company_name FROM mining_company')).rows.map((r) => [r.company_name.toLowerCase(), r.company_id]));

    // States and districts: add the missing ones, placed at their first mine for now
    const places = [...new Map(prepared.map((p) => [`${p.state}|${p.district}`, { state: p.state, district: p.district, lat: p.m.lat, lng: p.m.lng }])).values()];
    await q('INSERT INTO state (state_name) SELECT DISTINCT unnest($1::text[]) ON CONFLICT (state_name) DO NOTHING', [places.map((p) => p.state)]);
    const newLocations = (await q(`INSERT INTO location (state_id, district, latitude, longitude)
      SELECT s.state_id, x.district, x.lat, x.lng FROM jsonb_to_recordset($1) AS x(state text, district text, lat float8, lng float8)
      JOIN state s ON s.state_name = x.state
      ON CONFLICT (state_id, district) DO NOTHING RETURNING location_id`, [JSON.stringify(places)])).rows.map((r) => r.location_id);
    stats.locations = newLocations.length;
    const locationByPlace = new Map((await q(`SELECT l.location_id, s.state_name, l.district FROM location l JOIN state s ON s.state_id = l.state_id`))
      .rows.map((r) => [`${r.state_name}|${r.district}`, r.location_id]));

    const existing = new Set((await q('SELECT mine_id FROM mine WHERE NOT is_sample')).rows.map((r) => r.mine_id));
    const rows = prepared.map(({ m, state, district, company }) => ({
      mine_id: m.mine_id,
      mine_name: m.name || (m.mineral_name ? `Unnamed ${m.mineral_name.toLowerCase()} mine` : 'Unnamed mine'),
      location_id: locationByPlace.get(`${state}|${district}`),
      company_id: company ? companyByName.get(company.toLowerCase()) : null,
      status: m.status,
      mine_type: m.mine_type,
      lat: m.lat,
      lng: m.lng,
      precision: m.precision,
      source_id: sourceId[SOURCE_KEY[m.source]],
      source_ref: m.source_ref,
      source_url: m.source_url,
    }));
    await q(`INSERT INTO mine (mine_id, mine_name, location_id, company_id, lease_id, status, mine_type, latitude, longitude,
                        location_precision, source_id, source_ref, source_url, is_sample)
      SELECT x.mine_id, x.mine_name, x.location_id, x.company_id, NULL, x.status::mine_status, x.mine_type::mine_kind, x.lat, x.lng,
             x.precision::location_precision, x.source_id, x.source_ref, x.source_url, FALSE
      FROM jsonb_to_recordset($1) AS x(mine_id text, mine_name text, location_id int, company_id int, status text, mine_type text,
                                       lat float8, lng float8, precision text, source_id smallint, source_ref text, source_url text)
      ON CONFLICT (mine_id) DO UPDATE SET
        mine_name = excluded.mine_name, location_id = excluded.location_id, company_id = excluded.company_id,
        status = excluded.status, mine_type = excluded.mine_type, latitude = excluded.latitude,
        longitude = excluded.longitude, location_precision = excluded.location_precision,
        source_id = excluded.source_id, source_ref = excluded.source_ref, source_url = excluded.source_url
      WHERE NOT mine.is_sample`, [JSON.stringify(rows)]);
    rows.forEach((r) => stats[existing.has(r.mine_id) ? 'updated' : 'inserted']++);
    const ids = rows.map((r) => r.mine_id);

    // Minerals and aliases: replace each imported mine's rows
    await q('DELETE FROM mine_mineral WHERE mine_id = ANY($1)', [ids]);
    const mineralRows = prepared.flatMap(({ m }) => (m.mineral_names || (m.mineral_name ? [m.mineral_name] : [])).map((name, i) => ({
      mine_id: m.mine_id,
      mineral_id: mineralId.get(name),
      is_primary: i === 0,
      note: i === 0 && m.mineral_inferred === 'operator' ? 'Mineral inferred from the operator' : null,
    })));
    await q(`INSERT INTO mine_mineral (mine_id, mineral_id, is_primary, ore_grade_description)
      SELECT DISTINCT ON (x.mine_id, x.mineral_id) x.mine_id, x.mineral_id, x.is_primary, x.note
      FROM jsonb_to_recordset($1) AS x(mine_id text, mineral_id int, is_primary boolean, note text)
      ORDER BY x.mine_id, x.mineral_id, x.is_primary DESC`, [JSON.stringify(mineralRows)]);
    await q('DELETE FROM mine_alias WHERE mine_id = ANY($1)', [ids]);
    await q(`INSERT INTO mine_alias (mine_id, alias)
      SELECT DISTINCT x.mine_id, x.alias FROM jsonb_to_recordset($1) AS x(mine_id text, alias text)`,
    [JSON.stringify(prepared.flatMap(({ m }) => m.aliases.map((alias) => ({ mine_id: m.mine_id, alias }))))]);

    // Imported mines no longer in the candidate list
    stats.deleted = (await q('DELETE FROM mine WHERE NOT is_sample AND NOT (mine_id = ANY($1))', [ids])).rowCount;

    // A district created by the import is placed at the mean of its mines
    if (newLocations.length) {
      await q(`UPDATE location l SET latitude = a.lat, longitude = a.lng
        FROM (SELECT location_id, AVG(latitude) AS lat, AVG(longitude) AS lng FROM mine GROUP BY location_id) a
        WHERE a.location_id = l.location_id AND l.location_id = ANY($1)`, [newLocations]);
    }
    await q('DELETE FROM location WHERE location_id NOT IN (SELECT location_id FROM mine) AND craton_region IS NULL');
    await q(`DELETE FROM mining_company WHERE company_id NOT IN (SELECT company_id FROM mine WHERE company_id IS NOT NULL)
      AND company_id NOT IN (SELECT company_id FROM lease) AND company_id NOT IN (SELECT preferred_bidder_id FROM block_auction)`);
  });

  await writeReport();
  console.log('Load:', stats);
  await getPool().end();
}

async function writeReport() {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT s.state_name AS state, COALESCE(mn.mineral_name, 'Not recorded') AS mineral, COUNT(*) AS n
    FROM mine m JOIN location l ON l.location_id = m.location_id JOIN state s ON s.state_id = l.state_id
    LEFT JOIN mine_mineral mm ON mm.mine_id = m.mine_id AND mm.is_primary
    LEFT JOIN mineral mn ON mn.mineral_id = mm.mineral_id
    GROUP BY s.state_name, 2 ORDER BY s.state_name, n DESC, 2`);
  const { rows: totals } = await pool.query(`
    SELECT ds.name AS source, COUNT(*) AS n FROM mine m JOIN data_source ds ON ds.source_id = m.source_id
    GROUP BY ds.name ORDER BY n DESC`);
  const byState = new Map();
  rows.forEach((r) => {
    if (!byState.has(r.state)) byState.set(r.state, []);
    byState.get(r.state).push(r);
  });
  const total = totals.reduce((s, t) => s + t.n, 0);
  const lines = [
    '# Mine import report',
    '',
    `Generated ${new Date().toISOString().slice(0, 10)} by \`npm run import:mines\`. ${total} mines in the database.`,
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

main().catch((err) => {
  console.error('Load failed:', err.message);
  process.exitCode = 1;
  getPool().end();
});
