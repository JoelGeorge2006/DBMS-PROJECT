/**
 * Build the MINERVA database on Supabase: npm run db:setup
 *
 * 1. Runs db/schema.sql (drops and recreates the "minerva" schema).
 * 2. Loads the mines, leases and sample records from data/seed/core.json.
 * 3. Loads the public statistics from data/public/*.csv (see data/public/README.md).
 * 4. Adds the demo users (PINs hashed here).
 *
 * Every mineral name in every source is mapped to one row of the commodity table
 * (db/commodities.js); a name with no mapping stops the load instead of being guessed.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

import { connectionConfig } from './pool.js';
import { DEMO_USERS, hashPin } from '../lib/auth.js';
import { COMMODITIES, CRITICAL, UNION_TERRITORIES, commodityName, stateName } from './commodities.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- Sources -----------------------------------------------------------------
const SOURCES = [
  { key: 'sample', name: 'MINERVA sample data', licence: 'Synthetic demonstration data, not official statistics' },
  { key: 'osm', name: 'OpenStreetMap', publisher: 'OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright', licence: 'ODbL 1.0 (© OpenStreetMap contributors)' },
  { key: 'wikidata', name: 'Wikidata', publisher: 'Wikimedia Foundation', url: 'https://www.wikidata.org', licence: 'CC0 1.0' },
  { key: 'econ_survey_2024', name: 'Economic Survey 2023-24, Statistical Appendix, Table 1.32: Production of Major Minerals',
    publisher: 'Ministry of Finance, Government of India', url: 'https://indiabudget.gov.in/economicsurvey/doc/stat/tab132.pdf',
    licence: 'Government of India publication (source: MCDR returns)', retrieved: '2026-10-27' },
  { key: 'ibm_imig_2223', name: 'Indian Mineral Industry at a Glance 2022-23 (Tables 1, 2, 3, 5, 9)',
    publisher: 'Indian Bureau of Mines, Ministry of Mines', url: 'https://ibm.gov.in/writereaddata/files/17501634866851601e3668eIMIG_2223_Annex_IIMYB.pdf',
    licence: 'Government of India publication', retrieved: '2026-10-27' },
  { key: 'csep_royalty', name: 'Minerals Royalty Rates in India, Annex-B (Second Schedule rates, 2009 and 2015)',
    publisher: 'Centre for Social and Economic Progress (2020)', url: 'https://csep.org/wp-content/uploads/2020/09/Minerals-royalty-rates-in-India-CSEP-NEW-22-sep.pdf',
    licence: 'Rates from the MMDR Act, 1957 (Second Schedule) as compiled by CSEP', retrieved: '2026-10-27' },
  { key: 'pib_royalty_2024', name: 'Cabinet approves royalty rates for mining of 12 critical and strategic minerals (29 Feb 2024)',
    publisher: 'Press Information Bureau, Government of India', url: 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=2010126',
    licence: 'Government of India press release', retrieved: '2026-10-27' },
  { key: 'pib_tranche_4', name: 'Successful auction of strategic mineral blocks in Tranche IV (7 Nov 2024)',
    publisher: 'Press Information Bureau, Government of India', url: 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=2071441',
    licence: 'Government of India press release', retrieved: '2026-10-27' },
  { key: 'pib_tranche_5', name: 'Ten critical and strategic mineral blocks auctioned in Tranche V (27 May 2025)',
    publisher: 'Press Information Bureau, Government of India', url: 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=2131723',
    licence: 'Government of India press release', retrieved: '2026-10-27' },
];

// Bidders not already in MINING_COMPANY, with their ownership as stated in the releases
const BIDDER_TYPES = {
  'Coal India Limited': 'Central PSU', 'NLC India Limited': 'Central PSU', 'Oil India Limited': 'Central PSU',
};

// --- Helpers -------------------------------------------------------------------
function readCsv(name) {
  const text = fs.readFileSync(path.join(ROOT, 'data', 'public', name), 'utf8').trim();
  const rows = [];
  for (const line of text.split('\n')) {
    const cells = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur.replace(/\r$/, ''));
    rows.push(cells);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] === '' ? null : r[i]])));
}

const client = new pg.Client(connectionConfig());
await client.connect();
const q = (sql, params) => client.query(sql, params);

/** Insert many rows: one statement per batch of up to 500 */
async function insertMany(table, columns, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const values = [];
    const tuples = batch.map((row) => `(${row.map((v) => { values.push(v); return `$${values.length}`; }).join(', ')})`);
    await q(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')}`, values);
  }
  return rows.length;
}

try {
  console.log('1/4 schema');
  await q(fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8'));

  await q('BEGIN');
  await q("SELECT set_config('minerva.seeding', 'on', true)");

  // --- Reference data ------------------------------------------------------------
  console.log('2/4 reference data and mines');
  const sourceId = {};
  for (const s of SOURCES) {
    const r = await q(`INSERT INTO data_source (source_key, name, publisher, url, licence, retrieved_on)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING source_id`, [s.key, s.name, s.publisher || null, s.url || null, s.licence, s.retrieved || null]);
    sourceId[s.key] = r.rows[0].source_id;
  }
  const core = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'seed', 'core.json'), 'utf8'));
  // core.json source ids: 1 sample, 2 OpenStreetMap, 3 Wikidata
  const oldSource = { 1: sourceId.sample, 2: sourceId.osm, 3: sourceId.wikidata };
  const osmDate = core.data_source.find((s) => s.source_id === 2)?.retrieved_on;
  if (osmDate) await q('UPDATE data_source SET retrieved_on = $1 WHERE source_key IN ($2, $3)', [osmDate, 'osm', 'wikidata']);

  const commodityId = {};
  for (const [category, names] of Object.entries(COMMODITIES)) {
    for (const name of names) {
      const r = await q('INSERT INTO commodity (commodity_name, category, is_critical) VALUES ($1, $2, $3) RETURNING commodity_id',
        [name, category, CRITICAL.has(name)]);
      commodityId[name] = r.rows[0].commodity_id;
    }
  }
  const commodityOf = (raw) => commodityId[commodityName(raw)];

  // States from every dataset that names one
  const stateNames = new Set([
    ...core.location.map((l) => stateName(l.state)),
    ...['state_production_value.csv', 'state_mining_leases.csv', 'state_reporting_mines.csv', 'critical_mineral_auctions.csv']
      .flatMap((f) => readCsv(f).map((r) => stateName(r.state))),
  ]);
  const stateId = {};
  for (const name of [...stateNames].sort()) {
    const r = await q('INSERT INTO state (state_name, is_union_territory) VALUES ($1, $2) RETURNING state_id', [name, UNION_TERRITORIES.has(name)]);
    stateId[name] = r.rows[0].state_id;
  }
  const stateOf = (raw) => stateId[stateName(raw)];

  // --- Core data (ids kept, so mine and lease ids match the previous database) --------------
  await insertMany('location', ['location_id', 'state_id', 'district', 'craton_region', 'latitude', 'longitude'],
    core.location.map((l) => [l.location_id, stateOf(l.state), l.district, l.craton_region, l.latitude, l.longitude]));
  await insertMany('mining_company', ['company_id', 'company_name', 'company_type', 'registered_office'],
    core.mining_company.map((c) => [c.company_id, c.company_name, c.company_type, c.registered_office]));
  await insertMany('lease', ['lease_id', 'company_id', 'execution_date', 'valid_till', 'royalty_rate_pct', 'lease_area_hectares', 'forest_clearance_stage', 'cto_valid_till'],
    core.lease.map((l) => [l.lease_id, l.company_id, l.execution_date, l.valid_till, l.royalty_rate_pct, l.lease_area_hectares, l.forest_clearance_stage, l.cto_valid_till]));
  await insertMany('mineral', ['mineral_id', 'mineral_name', 'mineral_type', 'commodity_id', 'fe_pct', 'sio2_pct', 'al2o3_pct', 'phosphorus_pct', 'moisture_pct'],
    core.mineral.map((m) => [m.mineral_id, m.mineral_name, m.mineral_type, commodityOf(m.mineral_name), m.fe_pct, m.sio2_pct, m.al2o3_pct, m.phosphorus_pct, m.moisture_pct]));
  await insertMany('mine', ['mine_id', 'mine_name', 'location_id', 'company_id', 'lease_id', 'status', 'mine_type', 'latitude', 'longitude', 'location_precision', 'source_id', 'source_ref', 'source_url', 'is_sample'],
    core.mine.map((m) => [m.mine_id, m.mine_name, m.location_id, m.company_id, m.lease_id, m.status, m.mine_type, m.latitude, m.longitude, m.location_precision, oldSource[m.source_id], m.source_ref, m.source_url, Boolean(m.is_sample)]));
  await insertMany('mine_mineral', ['mine_id', 'mineral_id', 'is_primary', 'ore_grade_description'],
    core.mine_mineral.map((m) => [m.mine_id, m.mineral_id, Boolean(m.is_primary), m.ore_grade_description]));
  await insertMany('production', ['prod_id', 'mine_id', 'mineral_id', 'fiscal_year', 'quantity_mt', 'dispatch_mt'],
    core.production.map((p) => [p.prod_id, p.mine_id, p.mineral_id, p.fiscal_year, p.quantity_mt, p.dispatch_mt]));
  if (core.mine_alias.length) await insertMany('mine_alias', ['mine_id', 'alias'], core.mine_alias.map((a) => [a.mine_id, a.alias]));
  if (core.mine_media.length) {
    await insertMany('mine_media', ['media_id', 'mine_id', 'url', 'author', 'licence', 'source_url'],
      core.mine_media.map((m) => [m.media_id, m.mine_id, m.url, m.author, m.licence, m.source_url]));
  }
  // Identity columns given explicit ids: continue numbering after the highest one
  for (const [table, col] of [['location', 'location_id'], ['mining_company', 'company_id'], ['mineral', 'mineral_id'], ['production', 'prod_id'], ['mine_media', 'media_id']]) {
    await q(`SELECT setval(pg_get_serial_sequence('minerva.${table}', '${col}'), GREATEST((SELECT MAX(${col}) FROM ${table}), 1))`);
  }

  // --- Public statistics --------------------------------------------------------
  console.log('3/4 public statistics');
  const products = new Map();
  for (const r of readCsv('national_production.csv')) {
    if (!products.has(r.product)) {
      const res = await q('INSERT INTO mineral_product (product_name, commodity_id, unit) VALUES ($1, $2, $3) RETURNING product_id',
        [r.product, commodityOf(r.product), r.unit]);
      products.set(r.product, res.rows[0].product_id);
    }
  }
  await insertMany('national_production', ['product_id', 'fiscal_year', 'quantity', 'value_rs_thousand', 'is_provisional', 'source_id'],
    readCsv('national_production.csv').map((r) => [products.get(r.product), r.fiscal_year, r.quantity, r.value_rs_thousand, r.provisional === 'true', sourceId.econ_survey_2024]));
  await insertMany('state_production_value', ['state_id', 'fiscal_year', 'value_rs_crore', 'excludes_fuel', 'source_id'],
    readCsv('state_production_value.csv').map((r) => [stateOf(r.state), r.fiscal_year, r.value_rs_crore, r.excludes_fuel === 'true', sourceId.ibm_imig_2223]));
  await insertMany('state_mining_lease_stat', ['state_id', 'as_on', 'lease_count', 'lease_area_ha', 'source_id'],
    readCsv('state_mining_leases.csv').map((r) => [stateOf(r.state), r.as_on, r.lease_count, r.lease_area_ha, sourceId.ibm_imig_2223]));
  await insertMany('state_reporting_mines', ['state_id', 'fiscal_year', 'reporting_mines', 'source_id'],
    readCsv('state_reporting_mines.csv').map((r) => [stateOf(r.state), r.fiscal_year, r.reporting_mines, sourceId.ibm_imig_2223]));
  await insertMany('commodity_mining_lease_stat', ['commodity_id', 'mineral_label', 'as_on', 'lease_count', 'lease_area_ha', 'source_id'],
    readCsv('mineral_mining_leases.csv').map((r) => [commodityOf(r.mineral), r.mineral, r.as_on, r.lease_count, r.lease_area_ha, sourceId.ibm_imig_2223]));

  // Iron ore reserves are split by ore type in the source: keep that as the form
  await insertMany('mineral_reserve', ['commodity_id', 'form', 'unit', 'reserves', 'remaining_resources', 'total_resources', 'is_estimated', 'as_on', 'source_id'],
    readCsv('mineral_reserves.csv').map((r) => {
      const iron = r.mineral.match(/^Iron Ore \((\w+)\)$/);
      return [commodityOf(iron ? 'Iron Ore' : r.mineral), (iron ? iron[1] : r.form || '').replace(/\s+/g, ' '), r.unit,
        r.reserves, r.remaining_resources, r.total_resources, r.note !== 'not estimated', r.as_on, sourceId.ibm_imig_2223];
    }));

  await insertMany('royalty_rate', ['commodity_id', 'grade', 'basis', 'rate_pct', 'rate_rs', 'schedule_year', 'rate_text', 'source_id'],
    readCsv('royalty_rates.csv').map((r) => [r.commodity.startsWith('(') ? null : commodityOf(r.commodity), r.grade || '', r.basis,
      r.rate_pct, r.rate_rs, r.schedule_year, r.rate_text, sourceId[r.source_key]]));

  for (const r of readCsv('critical_mineral_auctions.csv')) {
    let bidder = (await q('SELECT company_id FROM mining_company WHERE lower(company_name) = lower($1)', [r.preferred_bidder])).rows[0];
    if (!bidder) {
      bidder = (await q('INSERT INTO mining_company (company_name, company_type) VALUES ($1, $2) RETURNING company_id',
        [r.preferred_bidder, BIDDER_TYPES[r.preferred_bidder] || 'Private'])).rows[0];
    }
    const block = (await q(`INSERT INTO block_auction (block_name, state_id, concession_type, tranche, announced_on, preferred_bidder_id, final_price_offer_pct, source_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING block_id`,
      [r.block_name, stateOf(r.state), r.concession_type, r.tranche, r.announced_on, bidder.company_id, r.final_price_offer_pct, sourceId[r.source_key]])).rows[0];
    for (const m of new Set(r.minerals.split(';').map(commodityOf))) {
      await q('INSERT INTO block_auction_commodity (block_id, commodity_id) VALUES ($1, $2)', [block.block_id, m]);
    }
  }

  // --- Users ----------------------------------------------------------------------
  console.log('4/4 demo users');
  for (const u of DEMO_USERS) {
    const { hash, salt } = hashPin(u.pin);
    await q('INSERT INTO app_user (username, display_name, role, password_hash, password_salt) VALUES ($1, $2, $3, $4, $5)',
      [u.username, u.display_name, u.role, hash, salt]);
  }

  await q('COMMIT');
  await q('ANALYZE');

  const counts = await q(`SELECT relname AS table, n_live_tup AS rows FROM pg_stat_user_tables
    WHERE schemaname = 'minerva' ORDER BY relname`);
  console.log(counts.rows.map((r) => `${r.table}=${r.rows}`).join(' '));
  console.log('Done.');
} catch (err) {
  await q('ROLLBACK').catch(() => {});
  console.error('Setup failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
