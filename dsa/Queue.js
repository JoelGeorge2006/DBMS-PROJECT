/**
 * MINERVA — DSA Module: Queue & Priority Queue
 * Application: alert / notification processing
 *
 * Queue (FIFO)
 *   enqueue(item)  O(1)
 *   dequeue()      O(1)   — head pointer instead of Array.shift()
 *   peek()         O(1)
 *
 * PriorityQueue (binary min-heap)
 *   enqueue(item, priority)  O(log n)
 *   dequeue()                O(log n)
 *   peek()                   O(1)
 *   Lower priority value = more urgent. Ties are broken by arrival
 *   order (a sequence number), so equal-priority items stay FIFO.
 *
 * AlertQueueManager shows one alert at a time: CRITICAL before
 * WARNING before INFO, arrival order within a level. Shown alerts go
 * into a bounded Queue, so the oldest are the first to be dropped.
 */

export const AlertPriority = {
  CRITICAL: 0,
  WARNING: 1,
  INFO: 2,
};

export const AlertPriorityLabel = {
  [AlertPriority.CRITICAL]: 'CRITICAL',
  [AlertPriority.WARNING]: 'WARNING',
  [AlertPriority.INFO]: 'INFO',
};

export class Queue {
  constructor() {
    this._items = {};
    this._head = 0;
    this._tail = 0;
  }

  enqueue(item) {
    this._items[this._tail] = item;
    this._tail++;
    return this.size();
  }

  dequeue() {
    if (this.isEmpty()) return undefined;
    const item = this._items[this._head];
    delete this._items[this._head];
    this._head++;
    return item;
  }

  peek() {
    return this.isEmpty() ? undefined : this._items[this._head];
  }

  isEmpty() {
    return this.size() === 0;
  }

  size() {
    return this._tail - this._head;
  }

  clear() {
    this._items = {};
    this._head = 0;
    this._tail = 0;
  }

  /** Front-to-rear order */
  toArray() {
    const out = [];
    for (let i = this._head; i < this._tail; i++) out.push(this._items[i]);
    return out;
  }
}

export class PriorityQueue {
  constructor() {
    this._heap = [];
    this._seq = 0;
  }

  /** a is more urgent than b */
  _less(a, b) {
    return a.priority !== b.priority ? a.priority < b.priority : a.seq < b.seq;
  }

  _swap(i, j) {
    [this._heap[i], this._heap[j]] = [this._heap[j], this._heap[i]];
  }

  _siftUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this._less(this._heap[i], this._heap[parent])) break;
      this._swap(i, parent);
      i = parent;
    }
  }

  _siftDown(i) {
    const n = this._heap.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && this._less(this._heap[left], this._heap[smallest])) smallest = left;
      if (right < n && this._less(this._heap[right], this._heap[smallest])) smallest = right;
      if (smallest === i) break;
      this._swap(i, smallest);
      i = smallest;
    }
  }

  enqueue(value, priority = AlertPriority.INFO) {
    const node = { value, priority, seq: this._seq++ };
    this._heap.push(node);
    this._siftUp(this._heap.length - 1);
    return this.size();
  }

  dequeue() {
    if (this.isEmpty()) return undefined;
    const top = this._heap[0];
    const last = this._heap.pop();
    if (this._heap.length > 0) {
      this._heap[0] = last;
      this._siftDown(0);
    }
    return top.value;
  }

  peek() {
    return this.isEmpty() ? undefined : this._heap[0].value;
  }

  isEmpty() {
    return this._heap.length === 0;
  }

  size() {
    return this._heap.length;
  }

  clear() {
    this._heap = [];
  }

  /** Items in the order they would be dequeued (does not mutate the heap) */
  toArray() {
    return [...this._heap].sort((a, b) => (this._less(a, b) ? -1 : 1)).map((n) => n.value);
  }
}

/**
 * Shows alerts one at a time through the supplied display handler.
 * Pending alerts wait in a PriorityQueue; shown alerts go to a bounded log.
 */
export class AlertQueueManager {
  constructor({ displayMs = 2800, logLimit = 30 } = {}) {
    this.pending = new PriorityQueue();
    // Bounded FIFO history: when full, the oldest alert is dequeued first
    this.log = new Queue();
    this.displayMs = displayMs;
    this.logLimit = logLimit;
    this.current = null;
    this._timer = null;
    this._show = null;
    this._hide = null;
    this._listeners = [];
  }

  setDisplayHandlers(show, hide) {
    this._show = show;
    this._hide = hide;
  }

  onChange(callback) {
    this._listeners.push(callback);
  }

  _notify() {
    this._listeners.forEach((cb) => cb(this));
  }

  add(message, priority = AlertPriority.INFO, meta = {}) {
    const alert = { message, priority, label: AlertPriorityLabel[priority], time: Date.now(), ...meta };
    this.pending.enqueue(alert, priority);
    this._notify();
    this._next();
    return alert;
  }

  critical(message, meta) { return this.add(message, AlertPriority.CRITICAL, meta); }
  warning(message, meta) { return this.add(message, AlertPriority.WARNING, meta); }
  info(message, meta) { return this.add(message, AlertPriority.INFO, meta); }

  /** Drop everything: pending, showing and history (e.g. on sign-out) */
  clear() {
    clearTimeout(this._timer);
    if (this.current && this._hide) this._hide(this.current);
    this.current = null;
    this.pending.clear();
    this.log.clear();
    this._notify();
  }

  /** Shown alerts, newest first */
  recent() {
    return this.log.toArray().reverse();
  }

  /** Close the visible alert early and move on to the next one */
  dismissCurrent() {
    if (!this.current) return;
    clearTimeout(this._timer);
    this._finish();
  }

  _next() {
    if (this.current || this.pending.isEmpty()) return;
    this.current = this.pending.dequeue();
    if (this._show) this._show(this.current);
    this._timer = setTimeout(() => this._finish(), this.displayMs);
    this._notify();
  }

  _finish() {
    if (this._hide) this._hide(this.current);
    this.log.enqueue(this.current);
    if (this.log.size() > this.logLimit) this.log.dequeue();
    this.current = null;
    this._notify();
    this._next();
  }
}

export default { Queue, PriorityQueue, AlertQueueManager, AlertPriority, AlertPriorityLabel };
