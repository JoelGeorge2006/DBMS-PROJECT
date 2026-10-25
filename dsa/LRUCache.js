/**
 * MINERVA — DSA Module: LRU cache (hash map + doubly linked list)
 * Application: session lookups. Every API request checks the session cookie;
 * the cache answers most of those without touching the USER_SESSION table.
 *
 *   get(key)        O(1)  moves the entry to the front (most recently used)
 *   set(key, value) O(1)  inserts at the front; evicts from the back when full
 *   delete(key)     O(1)
 *
 * The Map gives O(1) lookup of a node; the linked list keeps usage order so the
 * least recently used entry is always at the tail. Entries may carry an expiry
 * time; an expired entry is removed when it is read.
 */

class Node {
  constructor(key, value, expiresAt) {
    this.key = key;
    this.value = value;
    this.expiresAt = expiresAt;
    this.prev = null;
    this.next = null;
  }
}

export class LRUCache {
  constructor(capacity = 1000) {
    if (!(capacity > 0)) throw new Error('capacity must be positive');
    this.capacity = capacity;
    this.map = new Map();
    // Sentinels: head.next is the most recent entry, tail.prev the least recent
    this.head = new Node(null, null, Infinity);
    this.tail = new Node(null, null, Infinity);
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  _unlink(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  _pushFront(node) {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next.prev = node;
    this.head.next = node;
  }

  /** Value for key, or undefined if absent or expired. `now` is injectable for tests. */
  get(key, now = Date.now()) {
    const node = this.map.get(key);
    if (!node) {
      this.misses++;
      return undefined;
    }
    if (node.expiresAt <= now) {
      this.delete(key);
      this.misses++;
      return undefined;
    }
    this._unlink(node);
    this._pushFront(node);
    this.hits++;
    return node.value;
  }

  /** ttlMs: optional time to live */
  set(key, value, ttlMs = Infinity, now = Date.now()) {
    const expiresAt = ttlMs === Infinity ? Infinity : now + ttlMs;
    const existing = this.map.get(key);
    if (existing) {
      existing.value = value;
      existing.expiresAt = expiresAt;
      this._unlink(existing);
      this._pushFront(existing);
      return this;
    }
    const node = new Node(key, value, expiresAt);
    this.map.set(key, node);
    this._pushFront(node);
    if (this.map.size > this.capacity) {
      const lru = this.tail.prev;
      this._unlink(lru);
      this.map.delete(lru.key);
      this.evictions++;
    }
    return this;
  }

  delete(key) {
    const node = this.map.get(key);
    if (!node) return false;
    this._unlink(node);
    this.map.delete(key);
    return true;
  }

  /** Remove every entry whose value matches (e.g. all sessions of one user) */
  deleteWhere(predicate) {
    let removed = 0;
    for (const [key, node] of this.map) {
      if (predicate(node.value, key)) {
        this.delete(key);
        removed++;
      }
    }
    return removed;
  }

  get size() {
    return this.map.size;
  }

  /** Keys from most to least recently used */
  keys() {
    const out = [];
    for (let n = this.head.next; n !== this.tail; n = n.next) out.push(n.key);
    return out;
  }

  hitRate() {
    const total = this.hits + this.misses;
    return total === 0 ? null : this.hits / total;
  }
}

export default LRUCache;
