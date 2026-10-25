/**
 * Download mine and quarry features in India from OpenStreetMap (Overpass API).
 * Output: data/raw/osm_mines.json  (ODbL, © OpenStreetMap contributors)
 *
 * Scope filtering (major minerals only) happens later in normalise.js, so the
 * raw file keeps everything that could be a mine.
 */
import fs from 'fs';
import path from 'path';
import { overpass } from './http.js';

const OUT = path.join(process.cwd(), 'data/raw/osm_mines.json');

const QUERY = `
[out:json][timeout:300];
area["ISO3166-1"="IN"][admin_level=2]->.in;
(
  nwr["landuse"~"^(quarry|mine)$"]["resource"](area.in);
  nwr["landuse"="quarry"]["name"](area.in);
  nwr["industrial"="mine"](area.in);
  nwr["man_made"="mineshaft"](area.in);
);
out tags center;
`;

const data = await overpass(QUERY);
const elements = data.elements.map((e) => ({
  type: e.type,
  id: e.id,
  lat: e.lat ?? e.center?.lat,
  lon: e.lon ?? e.center?.lon,
  tags: e.tags || {},
}));
fs.writeFileSync(
  OUT,
  JSON.stringify({ source: 'OpenStreetMap via Overpass API', licence: 'ODbL 1.0', retrieved: new Date().toISOString(), osm_base: data.osm3s?.timestamp_osm_base, elements }, null, 1)
);
console.log(`Wrote ${elements.length} OSM features to ${OUT}`);
