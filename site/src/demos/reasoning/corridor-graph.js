// Schematic route graph for the mission-console mini map. Node IDs and names follow the FIIR corridor
// environment used in the SAS experiments (24 nodes); positions and junction links are a simplified
// sketch for illustration, not the surveyed graph.
export const NODES = [
  { id: 0, name: 'toilet_m', x: 62, y: 46 },
  { id: 1, name: 'hall_entry', x: 26, y: 132 },
  { id: 2, name: 'hall_exit', x: 26, y: 196 },
  { id: 3, x: 66, y: 164 },
  { id: 4, name: 'toilet_f', x: 112, y: 46 },
  { id: 5, name: 'cb204', x: 168, y: 40 },
  { id: 6, x: 86, y: 104 },
  { id: 7, x: 138, y: 104 },
  { id: 8, name: 'cb202', x: 232, y: 40 },
  { id: 9, name: 'radiator', x: 204, y: 156 },
  { id: 10, x: 194, y: 104 },
  { id: 11, x: 250, y: 104 },
  { id: 12, x: 306, y: 104 },
  { id: 13, name: 'plant_4', x: 272, y: 160 },
  { id: 14, name: 'plant_5', x: 334, y: 40 },
  { id: 15, x: 290, y: 46 },
  { id: 16, x: 364, y: 104 },
  { id: 17, x: 364, y: 168 },
  { id: 18, x: 132, y: 172 },
  { id: 19, name: 'plant_3', x: 378, y: 222 },
  { id: 20, name: 'plant_2', x: 312, y: 214 },
  { id: 21, name: 'plant_1', x: 240, y: 216 },
  { id: 22, name: 'cb203_entrance', x: 164, y: 222 },
  { id: 23, name: 'cb203_exit', x: 92, y: 226 },
];

export const EDGES = [
  [1, 6], [2, 3], [1, 3], [3, 6], [6, 0], [6, 7], [7, 4], [7, 5], [7, 10], [10, 9], [10, 11], [11, 8],
  [11, 15], [15, 14], [11, 12], [12, 13], [12, 16], [16, 14], [16, 17], [17, 19], [17, 20], [20, 21],
  [21, 9], [13, 20], [3, 18], [18, 9], [18, 22], [18, 23], [22, 21], [23, 2],
];

export const PLANTS = [13, 14, 19, 20, 21];

const dist = (a, b) => Math.hypot(NODES[a].x - NODES[b].x, NODES[a].y - NODES[b].y);

/** Dijkstra over the schematic graph; returns the list of node ids from a to b. */
export function shortestPath(a, b) {
  const n = NODES.length;
  const d = Array(n).fill(Infinity), prev = Array(n).fill(-1), done = Array(n).fill(false);
  const adj = NODES.map(() => []);
  EDGES.forEach(([u, v]) => { adj[u].push(v); adj[v].push(u); });
  d[a] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && d[i] < Infinity && (u < 0 || d[i] < d[u])) u = i;
    if (u < 0 || u === b) break;
    done[u] = true;
    for (const v of adj[u]) { const nd = d[u] + dist(u, v); if (nd < d[v]) { d[v] = nd; prev[v] = u; } }
  }
  const path = [];
  for (let v = b; v >= 0; v = prev[v]) path.unshift(v);
  return path[0] === a ? path : [a, b];
}

export const nearestOf = (from, ids) => ids.reduce((best, id) => (dist(from, id) < dist(from, best) ? id : best), ids[0]);
