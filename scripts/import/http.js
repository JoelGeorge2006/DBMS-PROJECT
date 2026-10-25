/**
 * Shared HTTP helpers for the import scripts (Node 18+ global fetch).
 * Public APIs ask for an identifying User-Agent and gentle request rates.
 */
export const USER_AGENT = 'MINERVA-student-project/0.2 (DBMS course; https://github.com/JoelGeorge2006/DBMS-PROJECT)';

const OVERPASS_ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

export async function overpass(query) {
  let lastError;
  for (const url of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: query }),
        });
        if (res.ok) return await res.json();
        lastError = new Error(`${url} -> HTTP ${res.status}`);
        // 429/504: the public server is busy, wait and retry
        await new Promise((r) => setTimeout(r, 5000 * attempt));
      } catch (err) {
        lastError = err;
      }
    }
  }
  throw lastError;
}

export async function sparql(query) {
  const url = new URL('https://query.wikidata.org/sparql');
  url.searchParams.set('query', query);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' } });
  if (!res.ok) throw new Error(`Wikidata SPARQL -> HTTP ${res.status}`);
  return res.json();
}
