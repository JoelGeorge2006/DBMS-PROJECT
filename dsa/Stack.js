/**
 * MINERVA — DSA Module: Stack
 * Application: SQL console query history (undo / redo)
 *
 * Stack (LIFO)
 *   push(item)  O(1)
 *   pop()       O(1)
 *   peek()      O(1)
 *
 * QueryHistoryManager uses two stacks:
 *   history — executed queries; the top is the current one
 *   redo    — queries stepped back over with undo()
 * Running a new query pushes it to history and clears redo,
 * the same way a text editor's undo/redo works.
 */

export class Stack {
  constructor(maxSize = Infinity) {
    this._items = [];
    this._maxSize = maxSize;
  }

  push(item) {
    this._items.push(item);
    // Bounded history: drop the oldest entry (bottom of the stack)
    if (this._items.length > this._maxSize) this._items.splice(0, 1);
    return this.size();
  }

  pop() {
    return this._items.pop();
  }

  peek() {
    return this._items[this._items.length - 1];
  }

  isEmpty() {
    return this._items.length === 0;
  }

  size() {
    return this._items.length;
  }

  clear() {
    this._items = [];
  }

  /** Bottom-to-top order */
  toArray() {
    return [...this._items];
  }
}

export class QueryHistoryManager {
  constructor(maxSize = 50) {
    this.history = new Stack(maxSize);
    this.redo = new Stack(maxSize);
  }

  /** Record an executed query. Re-running the current query is not duplicated. */
  record(query) {
    const text = query.trim();
    if (!text) return;
    this.redo.clear();
    if (this.history.peek() === text) return;
    this.history.push(text);
  }

  canUndo() {
    return this.history.size() > 1;
  }

  canRedo() {
    return !this.redo.isEmpty();
  }

  /** Step back: move the current query to redo, return the one below it */
  undo() {
    if (!this.canUndo()) return null;
    this.redo.push(this.history.pop());
    return this.history.peek();
  }

  /** Step forward: move the top of redo back onto history and return it */
  redoQuery() {
    if (!this.canRedo()) return null;
    const query = this.redo.pop();
    this.history.push(query);
    return query;
  }

  /** Most recent first, for display */
  recent(limit = 10) {
    return this.history.toArray().reverse().slice(0, limit);
  }
}

export default { Stack, QueryHistoryManager };
