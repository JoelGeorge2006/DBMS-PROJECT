/**
 * MINERVA — DSA Module: Binary Search Tree
 * Application: mineral assay range search (e.g. Fe% between 50 and 70)
 *
 *   insert(key, data)     O(h)
 *   search(key)           O(h)
 *   rangeQuery(min, max)  O(h + k)   k = number of matches
 *   inOrder()             O(n)       keys in ascending order
 *
 * h is the tree height: about log n for random insertion order,
 * n in the worst case (sorted input). Duplicate keys go right.
 * Every search records the nodes it visited so the UI can show
 * how much of the tree was skipped compared with a linear scan.
 */

class BSTNode {
  constructor(key, data) {
    this.key = key;
    this.data = data;
    this.left = null;
    this.right = null;
  }
}

export class BinarySearchTree {
  constructor() {
    this.root = null;
    this._size = 0;
    this._nextId = 0;
  }

  insert(key, data) {
    const node = new BSTNode(key, data);
    node.id = this._nextId++;
    this._size++;
    if (!this.root) {
      this.root = node;
      return node;
    }
    let cur = this.root;
    for (;;) {
      if (key < cur.key) {
        if (!cur.left) { cur.left = node; break; }
        cur = cur.left;
      } else {
        if (!cur.right) { cur.right = node; break; }
        cur = cur.right;
      }
    }
    return node;
  }

  /** Exact match. Returns { node, visited } where visited lists node ids on the path. */
  search(key) {
    const visited = [];
    let cur = this.root;
    while (cur) {
      visited.push(cur.id);
      if (key === cur.key) return { node: cur, visited };
      cur = key < cur.key ? cur.left : cur.right;
    }
    return { node: null, visited };
  }

  /**
   * All nodes with min <= key <= max, in ascending key order.
   * Subtrees that cannot contain a match are never entered.
   */
  rangeQuery(min, max) {
    const results = [];
    const visited = [];
    const walk = (node) => {
      if (!node) return;
      visited.push(node.id);
      if (node.key > min) walk(node.left);
      if (node.key >= min && node.key <= max) results.push(node);
      if (node.key <= max) walk(node.right);
    };
    walk(this.root);
    return { results, visited };
  }

  inOrder() {
    const out = [];
    const walk = (node) => {
      if (!node) return;
      walk(node.left);
      out.push(node);
      walk(node.right);
    };
    walk(this.root);
    return out;
  }

  height() {
    const h = (node) => (node ? 1 + Math.max(h(node.left), h(node.right)) : -1);
    return h(this.root);
  }

  size() {
    return this._size;
  }

  /** Plain nested object for JSON / drawing: { id, key, label, left, right } */
  toJSON(labelOf = (node) => String(node.key)) {
    const ser = (node) =>
      node ? { id: node.id, key: node.key, label: labelOf(node), left: ser(node.left), right: ser(node.right) } : null;
    return ser(this.root);
  }

  /** Baseline for comparison: checks every item, O(n) */
  static linearRangeSearch(items, min, max, keyOf) {
    const results = items.filter((item) => {
      const k = keyOf(item);
      return k >= min && k <= max;
    });
    return { results, comparisons: items.length };
  }
}

export default BinarySearchTree;
