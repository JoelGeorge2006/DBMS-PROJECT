/**
 * MINERVA — search index (server side)
 *
 * One Trie (dsa/Trie.js) over every searchable name: mines (and their aliases and
 * ids), minerals, states and districts, companies and lease ids. Each node keeps
 * its top-k entries by weight, so a prefix lookup never walks a subtree.
 * Weight = how many mines an entry covers (a mine itself counts 1, plus 1 if it
 * has a name), so "co" suggests Coal before a single "Co..." mine.
 *
 * If a word has no prefix match, the typo fallback compares it with indexed words
 * that start with the same letter using Levenshtein distance (at most 1 edit for
 * words up to 4 letters, 2 for longer ones) and searches with the closest word.
 */
import { Trie, levenshtein, tokenize } from '../dsa/Trie.js';

export const GROUPS = ['mine', 'mineral', 'place', 'company', 'lease'];

export function buildSearchIndex(db) {
  const started = Date.now();
  const trie = new Trie(12);

  const mines = db.prepare(`
    SELECT m.mine_id, m.mine_name, m.status, l.state, l.district, mn.mineral_name
    FROM MINE m JOIN LOCATION l ON l.location_id = m.location_id
    LEFT JOIN MINE_MINERAL mm ON mm.mine_id = m.mine_id AND mm.is_primary = 1
    LEFT JOIN MINERAL mn ON mn.mineral_id = mm.mineral_id`).all();
  const aliases = db.prepare('SELECT mine_id, alias FROM MINE_ALIAS').all();
  const aliasBy = new Map();
  aliases.forEach((a) => aliasBy.set(a.mine_id, [...(aliasBy.get(a.mine_id) || []), a.alias]));

  mines.forEach((m) => {
    const named = !/^unnamed /i.test(m.mine_name);
    const entry = {
      id: `mine:${m.mine_id}`,
      type: 'mine',
      key: m.mine_id,
      label: m.mine_name,
      sub: [m.mineral_name, `${m.district}, ${m.state}`].filter(Boolean).join(' · '),
      weight: 1 + (named ? 1 : 0),
    };
    // Mineral and place words too, so "iron odisha" finds iron-ore mines in Odisha
    trie.add([m.mine_name, m.mine_id, ...(aliasBy.get(m.mine_id) || []), m.mineral_name, m.district, m.state].join(' '), entry);
  });

  db.prepare(`SELECT mn.mineral_name, mn.mineral_type, COUNT(mm.mine_id) AS n
    FROM MINERAL mn JOIN MINE_MINERAL mm ON mm.mineral_id = mn.mineral_id
    GROUP BY mn.mineral_id`).all().forEach((r) => {
    trie.add(r.mineral_name, {
      id: `mineral:${r.mineral_name}`, type: 'mineral', key: r.mineral_name, label: r.mineral_name,
      sub: `${r.n} mine${r.n === 1 ? '' : 's'} · ${r.mineral_type}`, weight: r.n,
    });
  });

  db.prepare(`SELECT l.state, l.district, COUNT(m.mine_id) AS n FROM LOCATION l
    JOIN MINE m ON m.location_id = l.location_id GROUP BY l.location_id`).all().forEach((r) => {
    trie.add(r.district, {
      id: `place:${r.state}|${r.district}`, type: 'place', key: `${r.state}|${r.district}`, label: r.district,
      sub: `District, ${r.state} · ${r.n} mine${r.n === 1 ? '' : 's'}`, weight: r.n,
    });
  });
  db.prepare(`SELECT l.state, COUNT(m.mine_id) AS n FROM LOCATION l
    JOIN MINE m ON m.location_id = l.location_id GROUP BY l.state`).all().forEach((r) => {
    trie.add(r.state, {
      id: `place:${r.state}`, type: 'place', key: r.state, label: r.state,
      sub: `State · ${r.n} mine${r.n === 1 ? '' : 's'}`, weight: r.n + 1,
    });
  });

  db.prepare(`SELECT c.company_id, c.company_name, c.company_type, COUNT(m.mine_id) AS n FROM MINING_COMPANY c
    LEFT JOIN MINE m ON m.company_id = c.company_id GROUP BY c.company_id`).all().forEach((r) => {
    trie.add(r.company_name, {
      id: `company:${r.company_id}`, type: 'company', key: r.company_name, label: r.company_name,
      sub: `${r.company_type === 'Unknown' ? 'Operator' : r.company_type} · ${r.n} mine${r.n === 1 ? '' : 's'}`, weight: r.n,
    });
  });

  db.prepare(`SELECT le.lease_id, le.valid_till, m.mine_id, m.mine_name FROM LEASE le
    LEFT JOIN MINE m ON m.lease_id = le.lease_id`).all().forEach((r) => {
    trie.add(r.lease_id, {
      id: `lease:${r.lease_id}`, type: 'lease', key: r.lease_id, label: r.lease_id,
      sub: `${r.mine_name ? `${r.mine_name} · ` : ''}ends ${r.valid_till}`, weight: 1, mineId: r.mine_id,
    });
  });

  return { trie, builtMs: Date.now() - started, entries: trie.entries.size, nodes: trie.nodeCount, words: trie.words.size };
}

/** Closest indexed word to `word` within the edit budget, or null */
function correctWord(trie, word) {
  const budget = word.length <= 4 ? 1 : 2;
  let best = null;
  let checked = 0;
  for (const candidate of trie.wordsStartingWith(word[0])) {
    checked++;
    const d = levenshtein(word, candidate, budget);
    if (d <= budget && (!best || d < best.d || (d === best.d && candidate.length < best.word.length))) best = { word: candidate, d };
  }
  return best ? { ...best, checked } : null;
}

/**
 * Suggestions grouped by type. Returns { groups: { mine: [...], ... }, corrected, tookMs }.
 * `corrected` is set when the typo fallback replaced a word.
 */
export function suggest(index, query, limit = 8) {
  const started = performance.now();
  const words = tokenize(query);
  if (words.length === 0) return { groups: {}, total: 0, corrected: null, tookMs: 0 };

  let hits = index.trie.suggest(words.join(' '), 40);
  let corrected = null;
  if (hits.length === 0) {
    // Correct each word that has no prefix match, then search again
    const fixed = words.map((w) => (index.trie.suggest(w, 1).length ? w : correctWord(index.trie, w)?.word || w));
    if (fixed.some((w, i) => w !== words[i])) {
      corrected = fixed.join(' ');
      hits = index.trie.suggest(corrected, 40);
    }
  }

  const groups = {};
  for (const e of hits) {
    if (!groups[e.type]) groups[e.type] = [];
    if (groups[e.type].length < limit) groups[e.type].push(e);
  }
  const total = Object.values(groups).reduce((n, g) => n + g.length, 0);
  return { groups, total, corrected, tookMs: Math.round((performance.now() - started) * 1000) / 1000 };
}
