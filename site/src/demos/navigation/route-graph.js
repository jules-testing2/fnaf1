// The FIIR corridor navigation graph and the semantic cost model from
// Abaza, Staicu, Doicin, "Lightweight Semantic-Aware Route Planning on Edge Hardware", Sensors 2026, 26, 2232.
//   Table 5  node ids and map-frame coordinates (m), 7 nodes / 10 bidirectional edge pairs
//   Table 4  mobility classes: base penalty, speed limit, TTL
//   §3.4.1   penalty_edge = Σ P_base × max(0.1, 1 − d/1.5) × confidence, speed_limit = min over objects
//   §3.5.2   DistanceScorer (w = 1.0, length scaled by speed limit) + PenaltyScorer (w = 5.0)
//   §3.6.2   replanning when any edge of the active route changes by more than δ = 2.0

export const NODES = {
  0: { x: 1.0, y: 0.0, name: 'start' },
  2: { x: 3.4, y: 0.0, name: 'center' },
  3: { x: 2.4, y: 1.0, name: 'in_top' },
  4: { x: 2.4, y: -0.5, name: 'in_bot' },
  5: { x: 4.8, y: 1.0, name: 'out_top' },
  6: { x: 4.8, y: -0.5, name: 'out_bot' },
  7: { x: 6.7, y: 0.0, name: 'goal' },
};
export const START = 0;
export const GOAL = 7;

/** Undirected pairs; the GeoJSON graph stores each as two directed edges (20 total). */
export const EDGES = [[0, 2], [0, 3], [0, 4], [2, 3], [2, 4], [2, 5], [2, 6], [2, 7], [5, 7], [6, 7]];
export const edgeKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export const MOBILITY = {
  dynamic: { base: 50, speed: 0.3, ttl: 60, label: 'dynamic' },
  static: { base: 15, speed: 0.6, ttl: Infinity, label: 'static' },
  minor: { base: 5, speed: 0.9, ttl: 120, label: 'minor' },
};
/** Classes used in the demo, each a representative class of its Table 4 category. */
export const CLASSES = {
  person: 'dynamic',
  chair: 'static',
  bench: 'static',
  bottle: 'minor',
};

export const PROXIMITY = 1.5;        // m, objects closer than this to an edge contribute
export const W_DISTANCE = 1.0;
export const W_PENALTY = 5.0;
export const DELTA = 2.0;            // replanning threshold on penalty change

const len = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

export function pointSegDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Penalty and speed limit for one edge given the persisted objects (only stable ones count). */
export function annotateEdge(a, b, objects) {
  let penalty = 0, speed = 1;
  for (const o of objects) {
    const d = pointSegDist(o, a, b);
    if (d >= PROXIMITY) continue;
    const m = MOBILITY[o.mobility];
    penalty += m.base * Math.max(0.1, 1 - d / PROXIMITY) * o.conf;
    speed = Math.min(speed, m.speed);
  }
  return { penalty, speed };
}

/** Annotates the whole graph: Map edgeKey -> { penalty, speed, length }. */
export function annotateGraph(objects) {
  const out = new Map();
  for (const [i, j] of EDGES) {
    const { penalty, speed } = annotateEdge(NODES[i], NODES[j], objects);
    out.set(edgeKey(i, j), { penalty, speed, length: len(NODES[i], NODES[j]) });
  }
  return out;
}

const edgeCost = (length, ann) => W_DISTANCE * length / ann.speed + W_PENALTY * ann.penalty;

/**
 * ComputeRoute from a pose on edge (a,b) at fraction f (0 = at a) to `goal`.
 * When the robot sits exactly on a node pass on = [node, node], f = 0.
 * Returns { nodes, cost, length, penalty } where nodes[0] is the first graph node to drive to.
 */
export function computeRoute(ann, on, f, goal = GOAL) {
  const [a, b] = on;
  const dist = new Map(), prev = new Map(), done = new Set();
  const seed = (n, l) => {
    const e = a === b ? null : ann.get(edgeKey(a, b));
    const c = e ? edgeCost(l, e) : 0;
    if (!dist.has(n) || c < dist.get(n)) { dist.set(n, c); prev.set(n, 'R'); }
  };
  const L = a === b ? 0 : len(NODES[a], NODES[b]);
  seed(a, f * L);
  if (a !== b) seed(b, (1 - f) * L);

  for (;;) {
    let u = null, best = Infinity;
    for (const [n, d] of dist) if (!done.has(n) && d < best) { best = d; u = n; }
    if (u === null) break;
    done.add(u);
    if (u === goal) break;
    for (const [i, j] of EDGES) {
      if (i !== u && j !== u) continue;
      const v = i === u ? j : i;
      const e = ann.get(edgeKey(i, j));
      const c = best + edgeCost(e.length, e);
      if (!dist.has(v) || c < dist.get(v)) { dist.set(v, c); prev.set(v, u); }
    }
  }
  const nodes = [];
  for (let n = goal; n !== 'R' && n !== undefined; n = prev.get(n)) nodes.unshift(n);
  // Split the cost into its geometric and semantic parts for the readout.
  let length = 0, penalty = 0, last = null;
  const legs = [];
  if (a !== b) {
    const first = nodes[0];
    const l = first === a ? f * L : (1 - f) * L;
    legs.push({ key: edgeKey(a, b), l });
  }
  for (const n of nodes) { if (last !== null) legs.push({ key: edgeKey(last, n), l: len(NODES[last], NODES[n]) }); last = n; }
  for (const { key, l } of legs) { const e = ann.get(key); length += l; penalty += e.penalty; }
  return { nodes, cost: dist.get(goal), length, penalty, keys: legs.map((x) => x.key) };
}
