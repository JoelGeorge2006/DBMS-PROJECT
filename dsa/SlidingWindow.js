/**
 * MINERVA — DSA Module: sliding-window rate limiter (one queue per key)
 * Application: sign-in lockout. Each key (username + address, or an address)
 * keeps a queue of recent failed-attempt times. Times older than the window are
 * dequeued from the front. When the queue reaches `limit`, the key is locked
 * for a full window from that moment (not merely until the oldest attempt ages
 * out, which could be seconds away).
 *
 *   record(key)    O(1) amortised (each timestamp is enqueued and dequeued once)
 *   check(key)     O(1) amortised
 *   sweep()        O(keys) drops keys whose queues and locks have expired
 */
import { Queue } from './Queue.js';

export class SlidingWindowLimiter {
  constructor({ limit = 5, windowMs = 15 * 60 * 1000, lockMs = windowMs } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.lockMs = lockMs;
    this.queues = new Map();
    this.locks = new Map(); // key -> locked until
  }

  _prune(key, now) {
    const q = this.queues.get(key);
    if (!q) return null;
    while (!q.isEmpty() && q.peek() <= now - this.windowMs) q.dequeue();
    if (q.isEmpty()) {
      this.queues.delete(key);
      return null;
    }
    return q;
  }

  /** { locked, retryAfterMs, attempts } for key at time now */
  check(key, now = Date.now()) {
    const until = this.locks.get(key);
    if (until !== undefined && until <= now) this.locks.delete(key);
    const q = this._prune(key, now);
    const attempts = q ? q.size() : 0;
    if (until > now) return { locked: true, retryAfterMs: until - now, attempts };
    return { locked: false, retryAfterMs: 0, attempts };
  }

  /** Record one failure; returns the state after recording */
  record(key, now = Date.now()) {
    this._prune(key, now);
    if (!this.queues.has(key)) this.queues.set(key, new Queue());
    const q = this.queues.get(key);
    q.enqueue(now);
    if (q.size() >= this.limit) this.locks.set(key, now + this.lockMs);
    if (this.queues.size > 1000) this.sweep(now);
    return this.check(key, now);
  }

  /** Forget a key (after a successful sign-in) */
  reset(key) {
    this.queues.delete(key);
    this.locks.delete(key);
  }

  /** Remove keys with no recent attempts and no active lock */
  sweep(now = Date.now()) {
    for (const key of [...this.queues.keys()]) this._prune(key, now);
    for (const [key, until] of this.locks) if (until <= now) this.locks.delete(key);
  }

  /** Keys with recent failures or an active lock */
  activeKeys(now = Date.now()) {
    this.sweep(now);
    return new Set([...this.queues.keys(), ...this.locks.keys()]).size;
  }
}

export default SlidingWindowLimiter;
