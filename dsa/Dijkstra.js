/**
 * MINERVA — DSA Module: Weighted graph + Dijkstra's shortest path
 * Application: shortest transport route between two mines
 *
 * Graph: undirected, weighted adjacency list (Map<node, Map<node, km>>)
 * Edge weight: great-circle distance in km (haversine) between mines.
 *
 * Corridors: each mine is linked to its k nearest mines. A complete
 * graph would make every shortest path the direct edge (straight-line
 * distances obey the triangle inequality), so routing would be trivial.
 * Nearest-neighbour links alone leave separate clusters (one per coalfield),
 * so connectComponents() then adds the shortest link between clusters,
 * Borůvka-style, until every mine is reachable.
 *
 * dijkstra(graph, source, target)   O((V + E) log V)
 *   Uses the binary-heap PriorityQueue from Queue.js. Stale heap
 *   entries (a node already settled at a shorter distance) are skipped
 *   instead of using decrease-key.
 */

import { PriorityQueue } from './Queue.js';
import { UnionFind } from './MST.js';

export class Graph {
  constructor() {
    this.adj = new Map();
    this.nodeData = new Map();
  }

  addNode(id, data = null) {
    if (!this.adj.has(id)) this.adj.set(id, new Map());
    if (data !== null) this.nodeData.set(id, data);
    return this;
  }

  addEdge(a, b, weight) {
    this.addNode(a);
    this.addNode(b);
    this.adj.get(a).set(b, weight);
    this.adj.get(b).set(a, weight);
    return this;
  }

  nodes() {
    return [...this.adj.keys()];
  }

  neighbours(id) {
    return this.adj.get(id) || new Map();
  }

  /** Each undirected edge once: [{ from, to, weight }] */
  edges() {
    const out = [];
    for (const [a, nbrs] of this.adj) {
      for (const [b, w] of nbrs) {
        if (String(a) < String(b)) out.push({ from: a, to: b, weight: w });
      }
    }
    return out;
  }
}

/** Great-circle distance in km */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const round1 = (x) => Math.round(x * 10) / 10;

/**
 * Link every mine to its k nearest mines.
 * mines: [{ id, lat, lng, ... }]. Weights are rounded to 0.1 km.
 */
export function buildNearestNeighbourGraph(mines, k = 3) {
  const g = new Graph();
  mines.forEach((m) => g.addNode(m.id, m));
  mines.forEach((m) => {
    mines
      .filter((o) => o.id !== m.id)
      .map((o) => ({ o, d: haversineKm(m.lat, m.lng, o.lat, o.lng) }))
      .sort((x, y) => x.d - y.d)
      .slice(0, k)
      .forEach(({ o, d }) => g.addEdge(m.id, o.id, round1(d)));
  });
  connectComponents(g, mines);
  return g;
}

/**
 * Join the graph's connected components (union-find), Borůvka-style: each round,
 * every component adds its shortest edge to a node in another component.
 * Components at least halve each round, so there are O(log n) rounds of O(n²) work.
 * Returns the number of edges added.
 */
export function connectComponents(g, mines) {
  const uf = new UnionFind(mines.map((m) => m.id));
  g.edges().forEach((e) => uf.union(e.from, e.to));
  let added = 0;
  while (uf.components > 1) {
    const best = new Map(); // component root -> shortest outgoing edge
    for (let i = 0; i < mines.length; i++) {
      for (let j = i + 1; j < mines.length; j++) {
        const a = mines[i];
        const b = mines[j];
        const ra = uf.find(a.id);
        const rb = uf.find(b.id);
        if (ra === rb) continue;
        const d = haversineKm(a.lat, a.lng, b.lat, b.lng);
        for (const r of [ra, rb]) {
          if (!best.has(r) || d < best.get(r).d) best.set(r, { a: a.id, b: b.id, d });
        }
      }
    }
    for (const { a, b, d } of best.values()) {
      if (uf.union(a, b)) {
        g.addEdge(a, b, round1(d));
        added++;
      }
    }
  }
  return added;
}

/** Complete graph: every pair of mines, weight = distance */
export function buildCompleteGraph(mines) {
  const g = new Graph();
  mines.forEach((m) => g.addNode(m.id, m));
  for (let i = 0; i < mines.length; i++) {
    for (let j = i + 1; j < mines.length; j++) {
      const a = mines[i];
      const b = mines[j];
      g.addEdge(a.id, b.id, round1(haversineKm(a.lat, a.lng, b.lat, b.lng)));
    }
  }
  return g;
}

/**
 * Shortest path from source to target.
 * Returns { path: [ids], distance, settledOrder } or { path: [], distance: Infinity } if unreachable.
 * settledOrder is the order nodes were finalised, useful for explaining the run.
 */
export function dijkstra(graph, source, target) {
  const dist = new Map(graph.nodes().map((n) => [n, Infinity]));
  const prev = new Map();
  const settled = new Set();
  const settledOrder = [];
  const pq = new PriorityQueue();

  if (!dist.has(source) || !dist.has(target)) return { path: [], distance: Infinity, settledOrder };

  dist.set(source, 0);
  pq.enqueue(source, 0);

  while (!pq.isEmpty()) {
    const u = pq.dequeue();
    if (settled.has(u)) continue; // stale entry
    settled.add(u);
    settledOrder.push(u);
    if (u === target) break;

    for (const [v, w] of graph.neighbours(u)) {
      if (settled.has(v)) continue;
      const alt = dist.get(u) + w;
      if (alt < dist.get(v)) {
        dist.set(v, alt);
        prev.set(v, u);
        pq.enqueue(v, alt);
      }
    }
  }

  if (dist.get(target) === Infinity) return { path: [], distance: Infinity, settledOrder };

  const path = [];
  for (let n = target; n !== undefined; n = prev.get(n)) path.unshift(n);
  return { path, distance: round1(dist.get(target)), settledOrder };
}

export default { Graph, haversineKm, buildNearestNeighbourGraph, buildCompleteGraph, connectComponents, dijkstra };
