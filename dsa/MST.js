/**
 * MINERVA — DSA Module: Minimum Spanning Tree (Prim's and Kruskal's)
 * Application: the shortest total length of links that connects every mine
 *
 * Both take a Graph from Dijkstra.js and return
 *   { edges: [{ from, to, weight }] in the order they were added, totalWeight }
 * On a connected graph both give the same total weight; the order the
 * edges are picked differs, which is what the map shows.
 *
 * primMST(graph, root)   O(E log V)
 *   Grow one tree from root, always taking the cheapest edge that leaves
 *   it. Candidate edges sit in the binary-heap PriorityQueue.
 *
 * kruskalMST(graph)      O(E log E)
 *   Sort all edges by weight and take each one that joins two different
 *   components. UnionFind (path compression + union by rank) answers
 *   "same component?" in near-constant time.
 */

import { PriorityQueue } from './Queue.js';

export class UnionFind {
  constructor(items) {
    this.parent = new Map();
    this.rank = new Map();
    for (const x of items) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    this.components = this.parent.size;
  }

  find(x) {
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root);
    // Path compression: point every node on the way straight at the root
    while (this.parent.get(x) !== root) {
      const next = this.parent.get(x);
      this.parent.set(x, root);
      x = next;
    }
    return root;
  }

  /** Merge the sets containing a and b. Returns false if already joined. */
  union(a, b) {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return false;
    if (this.rank.get(ra) < this.rank.get(rb)) [ra, rb] = [rb, ra];
    this.parent.set(rb, ra);
    if (this.rank.get(ra) === this.rank.get(rb)) this.rank.set(ra, this.rank.get(ra) + 1);
    this.components--;
    return true;
  }

  connected(a, b) {
    return this.find(a) === this.find(b);
  }
}

const total = (edges) => Math.round(edges.reduce((sum, e) => sum + e.weight, 0) * 10) / 10;

export function primMST(graph, root = graph.nodes()[0]) {
  const inTree = new Set([root]);
  const edges = [];
  const pq = new PriorityQueue();
  const pushEdges = (u) => {
    for (const [v, w] of graph.neighbours(u)) {
      if (!inTree.has(v)) pq.enqueue({ from: u, to: v, weight: w }, w);
    }
  };
  pushEdges(root);

  while (!pq.isEmpty() && inTree.size < graph.nodes().length) {
    const e = pq.dequeue();
    if (inTree.has(e.to)) continue; // both ends already in the tree
    inTree.add(e.to);
    edges.push(e);
    pushEdges(e.to);
  }
  return { edges, totalWeight: total(edges), spanning: inTree.size === graph.nodes().length };
}

export function kruskalMST(graph) {
  const uf = new UnionFind(graph.nodes());
  const sorted = graph.edges().sort((a, b) => a.weight - b.weight);
  const edges = [];
  let rejected = 0;
  for (const e of sorted) {
    if (uf.union(e.from, e.to)) {
      edges.push(e);
      if (uf.components === 1) break;
    } else {
      rejected++; // would close a cycle
    }
  }
  return { edges, totalWeight: total(edges), spanning: uf.components === 1, rejected };
}

export default { UnionFind, primMST, kruskalMST };
