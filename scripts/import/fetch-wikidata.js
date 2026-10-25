/**
 * Download mines located in India from Wikidata (CC0).
 * Output: data/raw/wikidata_mines.json
 */
import fs from 'fs';
import path from 'path';
import { sparql } from './http.js';

const OUT = path.join(process.cwd(), 'data/raw/wikidata_mines.json');

// Items that are (a subclass of) mine (Q820477), in India (Q668), with coordinates
const QUERY = `
SELECT ?item ?itemLabel ?coord
  (GROUP_CONCAT(DISTINCT ?classLabel; separator="|") AS ?classes)
  (GROUP_CONCAT(DISTINCT ?productLabel; separator="|") AS ?products)
  (GROUP_CONCAT(DISTINCT ?operatorLabel; separator="|") AS ?operators)
  (GROUP_CONCAT(DISTINCT ?adminLabel; separator="|") AS ?admins)
  (SAMPLE(?osmWay) AS ?osm_way) (SAMPLE(?osmRel) AS ?osm_relation) (SAMPLE(?article) AS ?enwiki)
WHERE {
  ?item wdt:P31/wdt:P279* wd:Q820477 ; wdt:P17 wd:Q668 ; wdt:P625 ?coord .
  OPTIONAL { ?item wdt:P31 ?class . ?class rdfs:label ?classLabel . FILTER(LANG(?classLabel) = "en") }
  OPTIONAL { ?item wdt:P1056 ?product . ?product rdfs:label ?productLabel . FILTER(LANG(?productLabel) = "en") }
  OPTIONAL { ?item wdt:P137 ?operator . ?operator rdfs:label ?operatorLabel . FILTER(LANG(?operatorLabel) = "en") }
  OPTIONAL { ?item wdt:P131 ?admin . ?admin rdfs:label ?adminLabel . FILTER(LANG(?adminLabel) = "en") }
  OPTIONAL { ?item wdt:P10689 ?osmWay }
  OPTIONAL { ?item wdt:P402 ?osmRel }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?item ?itemLabel ?coord
`;

const data = await sparql(QUERY);
const items = data.results.bindings.map((b) => {
  const [lon, lat] = b.coord.value.replace(/^Point\(|\)$/g, '').split(' ').map(Number);
  const list = (k) => (b[k]?.value ? b[k].value.split('|').filter(Boolean) : []);
  return {
    qid: b.item.value.split('/').pop(),
    label: b.itemLabel?.value,
    lat,
    lon,
    classes: list('classes'),
    products: list('products'),
    operators: list('operators'),
    admins: list('admins'),
    osm_way: b.osm_way?.value || null,
    osm_relation: b.osm_relation?.value || null,
    enwiki: b.enwiki?.value || null,
  };
});
fs.writeFileSync(OUT, JSON.stringify({ source: 'Wikidata', licence: 'CC0 1.0', retrieved: new Date().toISOString(), items }, null, 1));
console.log(`Wrote ${items.length} Wikidata items to ${OUT}`);
