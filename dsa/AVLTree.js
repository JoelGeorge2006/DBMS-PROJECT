/**
 * MINERVA — DSA Module: AVL Tree
 * Application: lease expiry index (keyed by LEASE.valid_till)
 *
 * A binary search tree that rebalances after every insert / delete so
 * the heights of any node's two subtrees differ by at most 1.
 *
 *   insert(key, data)     O(log n)
 *   delete(key)           O(log n)
 *   rangeQuery(min, max)  O(log n + k)
 *   firstN(n)             O(log n + n)   earliest keys, e.g. next expiries
 *
 * balance(node) = height(left) - height(right)
 *   > 1 and the new key went left-left   -> rotate right
 *   < -1 and right-right                 -> rotate left
 *   left-right / right-left              -> double rotation
 *
 * Keys are compared with < and >, so ISO date strings ("2037-08-19")
 * sort correctly. Callers that may repeat a date should make the key
 * unique (e.g. "2037-08-19|RJ-JJ-2012-114").
 */

class AVLNode {
  constructor(key, data) {
    this.key = key;
    this.data = data;
    this.left = null;
    this.right = null;
    this.height = 0;
  }
}

const height = (node) => (node ? node.height : -1);
const balance = (node) => (node ? height(node.left) - height(node.right) : 0);
const update = (node) => {
  node.height = 1 + Math.max(height(node.left), height(node.right));
};

export class AVLTree {
  constructor() {
    this.root = null;
    this._size = 0;
    /** Rotations performed by the most recent insert/delete */
    this.lastRotations = [];
    this.totalRotations = 0;
  }

  _rotateRight(y) {
    const x = y.left;
    y.left = x.right;
    x.right = y;
    update(y);
    update(x);
    this._log('right', y.key);
    return x;
  }

  _rotateLeft(x) {
    const y = x.right;
    x.right = y.left;
    y.left = x;
    update(x);
    update(y);
    this._log('left', x.key);
    return y;
  }

  _log(direction, pivot) {
    this.lastRotations.push({ direction, pivot });
    this.totalRotations++;
  }

  _rebalance(node) {
    update(node);
    const b = balance(node);
    if (b > 1) {
      if (balance(node.left) < 0) node.left = this._rotateLeft(node.left); // left-right
      return this._rotateRight(node);
    }
    if (b < -1) {
      if (balance(node.right) > 0) node.right = this._rotateRight(node.right); // right-left
      return this._rotateLeft(node);
    }
    return node;
  }

  /** Insert; an existing key has its data replaced. */
  insert(key, data) {
    this.lastRotations = [];
    const ins = (node) => {
      if (!node) {
        this._size++;
        return new AVLNode(key, data);
      }
      if (key < node.key) node.left = ins(node.left);
      else if (key > node.key) node.right = ins(node.right);
      else {
        node.data = data;
        return node;
      }
      return this._rebalance(node);
    };
    this.root = ins(this.root);
    return this;
  }

  /** Delete by key. Returns true if the key was present. */
  delete(key) {
    this.lastRotations = [];
    let removed = false;
    const del = (node, k) => {
      if (!node) return null;
      if (k < node.key) node.left = del(node.left, k);
      else if (k > node.key) node.right = del(node.right, k);
      else {
        removed = true;
        if (!node.left || !node.right) return node.left || node.right;
        // Two children: replace with in-order successor, then delete it
        let succ = node.right;
        while (succ.left) succ = succ.left;
        node.key = succ.key;
        node.data = succ.data;
        node.right = del(node.right, succ.key);
      }
      return this._rebalance(node);
    };
    this.root = del(this.root, key);
    if (removed) this._size--;
    return removed;
  }

  has(key) {
    let cur = this.root;
    while (cur) {
      if (key === cur.key) return true;
      cur = key < cur.key ? cur.left : cur.right;
    }
    return false;
  }

  rangeQuery(min, max) {
    const out = [];
    const walk = (node) => {
      if (!node) return;
      if (node.key > min) walk(node.left);
      if (node.key >= min && node.key <= max) out.push(node);
      if (node.key < max) walk(node.right);
    };
    walk(this.root);
    return out;
  }

  /** The n smallest keys at or after `from`, in order */
  firstN(n, from = '') {
    const out = [];
    const walk = (node) => {
      if (!node || out.length >= n) return;
      if (node.key >= from) walk(node.left);
      if (out.length < n && node.key >= from) out.push(node);
      walk(node.right);
    };
    walk(this.root);
    return out;
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
    return height(this.root);
  }

  size() {
    return this._size;
  }

  /** True if every node satisfies the AVL property and stored heights are right */
  isBalanced() {
    const check = (node) => {
      if (!node) return -1;
      const l = check(node.left);
      const r = check(node.right);
      if (l === null || r === null || Math.abs(l - r) > 1) return null;
      const h = 1 + Math.max(l, r);
      return h === node.height ? h : null;
    };
    return check(this.root) !== null;
  }

  /** Nested plain object for drawing: { key, label, balance, left, right } */
  toJSON(labelOf = (node) => String(node.key)) {
    const ser = (node) =>
      node
        ? { key: node.key, label: labelOf(node), balance: balance(node), left: ser(node.left), right: ser(node.right) }
        : null;
    return ser(this.root);
  }
}

export default AVLTree;
