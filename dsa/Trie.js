/**
 * MINERVA — DSA Module: Trie with top-k suggestions
 * Application: search-as-you-type over mines, minerals, places, companies, leases
 *
 * Every word of every indexed name is inserted (so "keonjhar north block" is
 * found by "keo", "nor" or "blo"). Each node keeps the k best entries whose
 * word passes through it, ranked by weight, in a small min-heap: the weakest of
 * the k sits at the root and is replaced when a better entry arrives.
 *
 *   insert(word, entry)   O(L log k)   L = word length
 *   suggest(prefix)       O(P + k log k)  P = prefix length; no subtree walk
 *                         (several words: the shortest top-k list is filtered by
 *                         the other words; if that runs short, every entry is checked)
 *   remove(id)            O(total length of the entry's words · k)
 *
 * Entries are { id, weight, ... }; an entry reached through several words of
 * the same name is stored once per node.
 */

class TrieNode {
  constructor() {
    this.children = new Map();
    this.top = []; // min-heap of entries by weight (top[0] is the weakest kept)
    this.terminal = false;
  }
}

const better = (a, b) => a.weight > b.weight || (a.weight === b.weight && a.id < b.id);

/** Push into a bounded min-heap of size k; returns true if the heap changed */
function heapOffer(heap, entry, k) {
  if (heap.some((e) => e.id === entry.id)) return false;
  if (heap.length < k) {
    heap.push(entry);
    siftUp(heap, heap.length - 1);
    return true;
  }
  if (!better(entry, heap[0])) return false;
  heap[0] = entry;
  siftDown(heap, 0);
  return true;
}

function siftUp(h, i) {
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (!better(h[p], h[i])) break;
    [h[p], h[i]] = [h[i], h[p]];
    i = p;
  }
}

function siftDown(h, i) {
  for (;;) {
    const l = 2 * i + 1;
    const r = l + 1;
    let m = i;
    if (l < h.length && better(h[m], h[l])) m = l;
    if (r < h.length && better(h[m], h[r])) m = r;
    if (m === i) return;
    [h[m], h[i]] = [h[i], h[m]];
    i = m;
  }
}

export const tokenize = (text) =>
  String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

export class Trie {
  constructor(k = 8) {
    this.k = k;
    this.root = new TrieNode();
    this.nodeCount = 1;
    this.words = new Set();
    this.entries = new Map(); // id -> { entry, words }
  }

  /** Index every word of `text` for this entry */
  add(text, entry) {
    const words = [...new Set(tokenize(text))];
    const rec = this.entries.get(entry.id) || { entry, words: new Set() };
    rec.entry = entry;
    words.forEach((w) => {
      rec.words.add(w);
      this._insertWord(w, entry);
    });
    this.entries.set(entry.id, rec);
  }

  _insertWord(word, entry) {
    let node = this.root;
    heapOffer(node.top, entry, this.k);
    for (const ch of word) {
      if (!node.children.has(ch)) {
        node.children.set(ch, new TrieNode());
        this.nodeCount++;
      }
      node = node.children.get(ch);
      heapOffer(node.top, entry, this.k);
    }
    node.terminal = true;
    this.words.add(word);
  }

  _node(prefix) {
    let node = this.root;
    for (const ch of prefix) {
      node = node.children.get(ch);
      if (!node) return null;
    }
    return node;
  }

  /**
   * Best entries matching every word of the query: the last word as a prefix,
   * earlier words as prefixes too ("north keo" finds "Keonjhar North Block").
   */
  suggest(query, limit = this.k) {
    const words = tokenize(query);
    if (words.length === 0) return [];
    const lists = words.map((w) => {
      const node = this._node(w);
      return node ? node.top : [];
    });
    const matchesAll = (e) => words.every((w) => [...(this.entries.get(e.id)?.words || [])].some((x) => x.startsWith(w)));
    if (words.length === 1) return [...lists[0]].sort((a, b) => (better(a, b) ? -1 : 1)).slice(0, limit);
    // Several words: start from the shortest top-k list, check the other words per entry
    const shortest = lists.reduce((a, b) => (b.length < a.length ? b : a));
    let hits = shortest.filter(matchesAll);
    // That list only holds the k best for one word; if it ran short, check every entry
    if (hits.length < limit && shortest.length === this.k) {
      hits = [...this.entries.values()].map((r) => r.entry).filter(matchesAll);
    }
    return hits.sort((a, b) => (better(a, b) ? -1 : 1)).slice(0, limit);
  }

  hasPrefix(prefix) {
    return this._node(tokenize(prefix).join('')) !== null;
  }

  /** Words starting with `letter`, for the typo fallback's candidate set */
  wordsStartingWith(letter) {
    const out = [];
    const node = this.root.children.get(letter);
    if (!node) return out;
    const walk = (n, acc) => {
      if (n.terminal) out.push(acc);
      for (const [ch, child] of n.children) walk(child, acc + ch);
    };
    walk(node, letter);
    return out;
  }

  /** Entries containing an exact word (used after the typo fallback picks a word) */
  entriesForWord(word) {
    const out = [];
    for (const { entry, words } of this.entries.values()) if (words.has(word)) out.push(entry);
    return out.sort((a, b) => (better(a, b) ? -1 : 1));
  }

  /** Rebuild-free removal: drop the entry, then refill the affected nodes' heaps */
  remove(id) {
    const rec = this.entries.get(id);
    if (!rec) return false;
    this.entries.delete(id);
    const affected = new Set();
    rec.words.forEach((w) => {
      let node = this.root;
      affected.add(node);
      for (const ch of w) {
        node = node.children.get(ch);
        if (!node) break;
        affected.add(node);
      }
    });
    // A node's heap may now have room for an entry it had to drop earlier
    affected.forEach((node) => (node.top = node.top.filter((e) => e.id !== id)));
    for (const { entry, words } of this.entries.values()) {
      words.forEach((w) => {
        let node = this.root;
        if (affected.has(node)) heapOffer(node.top, entry, this.k);
        for (const ch of w) {
          node = node.children.get(ch);
          if (!node) break;
          if (affected.has(node)) heapOffer(node.top, entry, this.k);
        }
      });
    }
    return true;
  }
}

/**
 * Levenshtein edit distance with an early cutoff: stops as soon as every value in
 * the current DP row exceeds maxDist. Two rolling rows: O(m·n) time, O(n) space.
 * Returns maxDist + 1 when the distance is larger than maxDist.
 */
export function levenshtein(a, b, maxDist = Infinity) {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let cur = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[b.length] <= maxDist ? prev[b.length] : maxDist + 1;
}

export default { Trie, levenshtein, tokenize };
