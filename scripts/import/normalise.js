/**
 * Turn the raw downloads into one deduplicated list of mines.
 *   in:  data/raw/osm_mines.json, data/raw/wikidata_mines.json, data/curated/*.csv (optional)
 *   out: data/processed/candidates.json
 *
 * Deduplication (pieces of one mine are often several OSM polygons):
 *   - points go into a hash map keyed by a ~2 km grid cell, so only the 9
 *     neighbouring cells are checked for each new point: O(1) per point
 *   - a point merges into an existing mine of the same mineral within 2 km
 *     when either is unnamed or their normalised names are equal
 *   - a Wikidata item merges into a mine with the same normalised name within 15 km
 */
import fs from 'fs';
import path from 'path';
import { MINERALS, OSM_RESOURCE, MINOR_RESOURCES, MINERAL_WORDS, mineralFromText, mineralsFromList, mineralFromOperator } from './minerals.js';

const ROOT = process.cwd();
const RAW = path.join(ROOT, 'data/raw');
const OUT = path.join(ROOT, 'data/processed/candidates.json');

const MERGE_KM = 2;
const NAME_MATCH_KM = 15;
// Grid cells must be at least MERGE_KM wide so the 3 x 3 neighbourhood covers it.
// 0.02 deg of latitude is ~2.2 km; a degree of longitude shrinks with cos(latitude),
// so longitude cells are widened for India's northern edge (~37 deg N).
const CELL_LAT = 0.02;
const CELL_LNG = 0.02 / Math.cos((37 * Math.PI) / 180);

export function haversineKm(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

const STOP_WORDS = new Set([
  'mine', 'mines', 'colliery', 'collieries', 'ocp', 'oc', 'ug', 'opencast', 'open', 'cast', 'project', 'projects',
  'block', 'expansion', 'quarry', 'quarries', 'area', 'phase', 'the', 'of', 'and', 'ltd', 'limited', 'pit',
]);

/** Comparison key for a mine name: lower case, no punctuation, no generic or mineral words,
 *  so "Sasti Coal Mine" (OSM) and "Sasti" (Wikidata) compare equal */
export function normaliseName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w) && !MINERAL_WORDS.has(w))
    .join(' ');
}

function osmMineral(tags) {
  const values = [tags.resource, tags.product]
    .filter(Boolean)
    .flatMap((v) => v.split(';'))
    .map((v) => v.trim().toLowerCase().replace(/\s+/g, '_'));
  const majors = [...new Set(values.map((v) => OSM_RESOURCE[v]).filter(Boolean))];
  if (majors.length) return { keys: majors };
  if (values.some((v) => MINOR_RESOURCES.has(v))) return { skip: 'minor mineral' };
  const fromName = mineralFromText(`${tags.name || ''} ${tags['name:en'] || ''}`);
  if (fromName) return { keys: [fromName] };
  // e.g. an SECL colliery whose name and tags don't say "coal"
  const fromOperator = mineralFromOperator(tags.operator);
  if (fromOperator) return { keys: [fromOperator], inferred: 'operator' };
  return { skip: 'no major mineral' };
}

function osmStatus(tags) {
  const closed = ['disused', 'abandoned'].some((k) => tags[k] === 'yes' || Object.keys(tags).some((t) => t.startsWith(`${k}:`)));
  return closed ? 'Closed' : 'Unknown';
}

function osmMineType(tags) {
  const name = `${tags.name || ''}`.toLowerCase();
  if (tags.man_made === 'mineshaft' || /\b(ug|underground)\b/.test(name)) return 'Underground';
  if (tags.landuse === 'quarry' || /\b(ocp|opencast|open cast)\b/.test(name)) return 'Opencast';
  return 'Unknown';
}

/** Spatial hash: grid cell -> mines whose point falls in that cell */
class GridIndex {
  constructor() {
    this.cells = new Map();
  }
  key(lat, lng) {
    return `${Math.floor(lat / CELL_LAT)}|${Math.floor(lng / CELL_LNG)}`;
  }
  add(rec) {
    const k = this.key(rec.lat, rec.lng);
    if (!this.cells.has(k)) this.cells.set(k, []);
    this.cells.get(k).push(rec);
  }
  /** Records in the 3 x 3 block of cells around a point (covers MERGE_KM) */
  near(lat, lng) {
    const r = Math.floor(lat / CELL_LAT);
    const c = Math.floor(lng / CELL_LNG);
    const out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) out.push(...(this.cells.get(`${r + dr}|${c + dc}`) || []));
    return out;
  }
}

function sameMineral(a, b) {
  return a.mineral === b.mineral || a.mineral === null || b.mineral === null;
}

export function dedupe(points) {
  const grid = new GridIndex();
  const byName = new Map();
  const mines = [];
  let merged = 0;

  // Named points first, so unnamed fragments attach to a named mine where one exists
  const ordered = [...points].sort((a, b) => (b.name ? 1 : 0) - (a.name ? 1 : 0) || a.order - b.order);

  for (const p of ordered) {
    let target = null;

    if (p.source === 'wikidata' && p.norm) {
      target = (byName.get(p.norm) || []).find((m) => haversineKm(m.lat, m.lng, p.lat, p.lng) <= NAME_MATCH_KM) || null;
    }
    if (!target) {
      target = grid.near(p.lat, p.lng).find((m) =>
        sameMineral(m, p) &&
        (!m.name || !p.name || m.norm === p.norm) &&
        haversineKm(m.lat, m.lng, p.lat, p.lng) <= MERGE_KM
      ) || null;
    }

    if (target) {
      merged++;
      target.refs.push(p.ref);
      if (!target.name && p.name) {
        target.name = p.name;
        target.norm = p.norm;
      } else if (p.name && p.name !== target.name) {
        target.aliases.add(p.name);
      }
      if (!target.mineral && p.mineral) target.mineral = p.mineral;
      p.minerals.forEach((k) => {
        if (!target.minerals.includes(k)) target.minerals.push(k);
      });
      if (!target.operator && p.operator) target.operator = p.operator;
      if (target.mine_type === 'Unknown') target.mine_type = p.mine_type;
      if (p.wikidata) target.wikidata = p.wikidata;
      if (p.enwiki) target.enwiki = p.enwiki;
      if (p.status === 'Closed') target.status = 'Closed';
      continue;
    }

    const rec = { ...p, minerals: [...p.minerals], aliases: new Set(), refs: [p.ref] };
    mines.push(rec);
    grid.add(rec);
    if (rec.norm) {
      if (!byName.has(rec.norm)) byName.set(rec.norm, []);
      byName.get(rec.norm).push(rec);
    }
  }
  return { mines, merged };
}

function readCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  if (lines.length < 2) return [];
  const split = (l) => (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || []).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim());
  const head = split(lines[0]);
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [head[i], v])));
}

function main() {
  const skipped = {};
  const skip = (why) => (skipped[why] = (skipped[why] || 0) + 1);
  const points = [];
  let order = 0;

  const osm = JSON.parse(fs.readFileSync(path.join(RAW, 'osm_mines.json'), 'utf8'));
  for (const e of osm.elements) {
    if (e.lat == null || e.lon == null) {
      skip('no coordinates');
      continue;
    }
    const t = e.tags;
    const m = osmMineral(t);
    if (m.skip) {
      skip(m.skip);
      continue;
    }
    const name = t['name:en'] || t.name || null;
    points.push({
      source: 'osm',
      ref: `${e.type}/${e.id}`,
      id: `OSM-${e.type[0].toUpperCase()}${e.id}`,
      url: `https://www.openstreetmap.org/${e.type}/${e.id}`,
      name,
      norm: normaliseName(name),
      mineral: m.keys[0],
      minerals: m.keys,
      mineralInferred: m.inferred || null,
      operator: t.operator || null,
      status: osmStatus(t),
      mine_type: osmMineType(t),
      lat: e.lat,
      lng: e.lon,
      precision: 'exact',
      order: order++,
    });
  }

  const wd = JSON.parse(fs.readFileSync(path.join(RAW, 'wikidata_mines.json'), 'utf8'));
  for (const it of wd.items) {
    const named = it.label && !/^Q\d+$/.test(it.label);
    const text = [...it.products, ...it.classes, it.label].join(' ');
    // Products in the order Wikidata lists them; else the label or class ("uranium mine")
    const minerals = it.products.length ? mineralsFromList(it.products) : mineralsFromList([it.label, ...it.classes]);
    const mineral = minerals[0] || null;
    if (it.classes.includes('village in India')) {
      skip('not a mine');
      continue;
    }
    if (it.classes.every((c) => c === 'quarry') && !mineral) {
      skip('minor mineral');
      continue;
    }
    // Without a mineral we can't tell a mine from a coalfield, company "Area" or township
    if (!mineral) {
      skip('wikidata item with no mineral');
      continue;
    }
    points.push({
      source: 'wikidata',
      ref: it.qid,
      id: `WD-${it.qid}`,
      url: `https://www.wikidata.org/wiki/${it.qid}`,
      name: named ? it.label : null,
      norm: named ? normaliseName(it.label) : '',
      mineral,
      minerals,
      operator: it.operators[0] || null,
      status: it.classes.includes('abandoned mine') ? 'Closed' : 'Unknown',
      mine_type: it.classes.includes('surface mine') ? 'Opencast' : /underground/i.test(text) ? 'Underground' : 'Unknown',
      lat: it.lat,
      lng: it.lon,
      precision: 'exact',
      wikidata: it.qid,
      enwiki: it.enwiki,
      order: order++,
    });
  }

  const curatedDir = path.join(ROOT, 'data/curated');
  const curated = fs.existsSync(curatedDir) ? fs.readdirSync(curatedDir).filter((f) => f.endsWith('.csv')) : [];
  for (const file of curated) {
    for (const r of readCsv(path.join(curatedDir, file))) {
      const mineral = mineralFromText(r.mineral);
      const lat = Number(r.lat);
      const lng = Number(r.lng);
      if (!r.name || !mineral || !Number.isFinite(lat) || !Number.isFinite(lng) || !r.source_url) {
        skip('curated row incomplete');
        continue;
      }
      points.push({
        source: 'curated',
        ref: r.source_url,
        id: `CUR-${normaliseName(r.name).replace(/ /g, '-').toUpperCase()}`,
        url: r.source_url,
        name: r.name,
        norm: normaliseName(r.name),
        mineral,
        minerals: [mineral],
        operator: r.lessee || null,
        status: 'Unknown',
        mine_type: 'Unknown',
        lat,
        lng,
        precision: ['exact', 'approximate', 'district'].includes(r.precision) ? r.precision : 'approximate',
        state: r.state || null,
        district: r.district || null,
        order: order++,
      });
    }
  }

  const { mines, merged } = dedupe(points);
  const out = mines.map((m) => ({
    mine_id: m.id,
    name: m.name,
    aliases: [...m.aliases].sort(),
    mineral: m.mineral,
    mineral_name: m.mineral ? MINERALS[m.mineral].name : null,
    // Every mineral the sources mention, primary first
    mineral_names: m.minerals.map((k) => MINERALS[k].name),
    mineral_inferred: m.mineralInferred || null,
    operator: m.operator,
    status: m.status,
    mine_type: m.mine_type,
    lat: Math.round(m.lat * 1e6) / 1e6,
    lng: Math.round(m.lng * 1e6) / 1e6,
    precision: m.precision,
    source: m.source,
    source_ref: m.ref,
    source_url: m.url,
    merged_refs: m.refs.slice(1),
    wikidata: m.wikidata || null,
    enwiki: m.enwiki || null,
    state: m.state || null,
    district: m.district || null,
  }));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`${points.length} candidate points -> ${out.length} mines (${merged} merged as duplicates)`);
  console.log('Skipped:', skipped);
  const byMineral = {};
  out.forEach((m) => (byMineral[m.mineral_name || 'Not recorded'] = (byMineral[m.mineral_name || 'Not recorded'] || 0) + 1));
  console.log('By mineral:', byMineral);
  console.log(`Named: ${out.filter((m) => m.name).length}, unnamed: ${out.filter((m) => !m.name).length}`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) main();
