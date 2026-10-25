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
 *
 * dijkstra(graph, source, target)   O((V + E) log V)
 *   Uses the binary-heap PriorityQueue from Queue.js. Stale heap
 *   entries (a node already settled at a shorter distance) are skipped
 *   instead of using decrease-key.
 */

import { PriorityQueue } from './Queue.js';

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
  return g;
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

export default { Graph, haversineKm, buildNearestNeighbourGraph, buildCompleteGraph, dijkstra };
