/**
 * MINERVA — DSA Module: convex hull (Andrew's monotone chain) and grid clustering
 *
 * convexHull(points)   O(n log n): sort by x then y, build the lower and upper
 *   chains, popping any point that would make a clockwise turn. Used to outline
 *   a cluster of mines when you hover it on the map.
 *
 * gridCluster(points, cellSize)   O(n): put each point in the hash-map bucket of
 *   its grid cell (in screen pixels at the current zoom), so mines that would
 *   overlap on screen become one cluster. Re-run on every zoom.
 */

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** points: [[x, y], ...] -> hull vertices in counter-clockwise order */
export function convexHull(points) {
  const pts = [...new Map(points.map((p) => [`${p[0]},${p[1]}`, p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** items: [{ x, y, ... }] -> [{ members: [...], x, y }] (x, y = mean of members) */
export function gridCluster(items, cellSize) {
  const cells = new Map();
  for (const it of items) {
    const key = `${Math.floor(it.x / cellSize)}|${Math.floor(it.y / cellSize)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(it);
  }
  return [...cells.values()].map((members) => ({
    members,
    x: members.reduce((s, m) => s + m.x, 0) / members.length,
    y: members.reduce((s, m) => s + m.y, 0) / members.length,
  }));
}

export default { convexHull, gridCluster };
