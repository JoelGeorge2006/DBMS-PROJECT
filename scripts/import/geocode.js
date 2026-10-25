/**
 * Look up the state (admin_level 4) and district (admin_level 5) containing each
 * candidate mine, using OpenStreetMap boundaries through Overpass is_in().
 *   in:  data/processed/candidates.json
 *   out: data/raw/admin_lookup.json  (cache: "lat,lng" -> { state, district })
 * Points already in the cache are not looked up again, so re-runs work offline.
 */
import fs from 'fs';
import path from 'path';
import { overpass } from './http.js';

const ROOT = process.cwd();
const CANDIDATES = path.join(ROOT, 'data/processed/candidates.json');
const CACHE = path.join(ROOT, 'data/raw/admin_lookup.json');
const BATCH = 120;

export const pointKey = (lat, lng) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

function batchQuery(points) {
  const blocks = points.map(
    (p, i) => `make pt idx=${i};out;is_in(${p.lat},${p.lng})->.a;area.a["boundary"="administrative"]["admin_level"~"^(4|5)$"];out tags;`
  );
  return `[out:json][timeout:240];${blocks.join('')}`;
}

function parse(elements, points) {
  const out = {};
  let i = -1;
  for (const el of elements) {
    if (el.type === 'pt') {
      i = Number(el.tags.idx);
      out[pointKey(points[i].lat, points[i].lng)] = { state: null, district: null };
      continue;
    }
    if (i < 0) continue;
    const name = el.tags['name:en'] || el.tags.name;
    const rec = out[pointKey(points[i].lat, points[i].lng)];
    if (el.tags.admin_level === '4' && !rec.state) rec.state = name;
    if (el.tags.admin_level === '5' && !rec.district) rec.district = name;
  }
  return out;
}

async function main() {
  const mines = JSON.parse(fs.readFileSync(CANDIDATES, 'utf8'));
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
  const todo = mines.filter((m) => !(m.state && m.district) && !cache[pointKey(m.lat, m.lng)]);
  console.log(`${mines.length} mines, ${todo.length} need a lookup`);

  for (let start = 0; start < todo.length; start += BATCH) {
    const batch = todo.slice(start, start + BATCH);
    const data = await overpass(batchQuery(batch));
    Object.assign(cache, parse(data.elements, batch));
    fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
    console.log(`  looked up ${Math.min(start + BATCH, todo.length)} / ${todo.length}`);
    await new Promise((r) => setTimeout(r, 2000)); // be gentle with the public server
  }

  const missing = mines.filter((m) => {
    const hit = cache[pointKey(m.lat, m.lng)];
    return !(m.state || hit?.state);
  });
  console.log(`Done. ${missing.length} mines have no state (outside OSM boundaries or offshore).`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) main();
