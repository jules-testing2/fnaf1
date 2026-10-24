// Deterministic simulation behind the route-replan demo. Everything is a function of sim time stepped
// at a fixed rate, so the same script replays identically and setProgress() can scrub through it.
//
// Pipeline modelled after the paper (Sensors 2026, 26, 2232):
//   prescan 360° → detections tracked (3 Hz fusion, stable after 3 hits) → written to the GeoJSON
//   semantic map → graph edges annotated (penalty + speed limit) → set_route_graph reload →
//   ComputeRoute from the nearest node (path-gap correction prepends the robot pose) → FollowPath,
//   with a penalty monitor that cancels and replans when an active edge changes by more than δ.

import { NODES, START, GOAL, CLASSES, DELTA, annotateGraph, computeRoute, edgeKey } from './route-graph.js';

export const STEP = 1 / 60;
const V_MAX = 0.55;          // demo-time cruise speed (m/s of sim time)
const W_MAX = 2.6;           // rad/s, in-place rotation of a differential drive
const LOOKAHEAD = 0.3;       // pure-pursuit carrot distance (m)
const MONITOR = 0.5;         // penalty monitor period (sim s)
const FUSION_HZ = 3;         // ASF fusion rate
const STABLE_HITS = 3;       // detections before an object is persisted
const PRESCAN = 2.6, RELOAD = 0.6, GOAL_HOLD = 2.6;
const REPLAN_HOLD = 1.2;     // sim s the robot waits while the new route is computed and drawn
const NEAR_GOAL = 1.0;       // early-termination guard: 2 × node proximity threshold (0.5 m)

/** Script for the first (forward) leg. Static furniture is found by the prescan, a person forces two replans. */
const SCRIPT = [
  { at: (s) => s.phase === 'prescan' && s.t >= 0.3, spawn: { cls: 'bench', x: 2.8, y: -1.58, conf: 0.88 } },
  { at: (s) => s.phase === 'prescan' && s.t >= 0.8, spawn: { cls: 'chair', x: 5.25, y: -1.62, conf: 0.82 } },
  { at: (s) => s.phase === 'prescan' && s.t >= 1.3, spawn: { cls: 'bottle', x: 1.7, y: 1.55, conf: 0.74 } },
  // A person steps next to the direct 2→7 edge while the robot drives 0→2.
  { at: (s) => s.phase === 'drive' && s.replans === 0 && s.robot.x >= 2.3, spawn: { cls: 'person', x: 5.6, y: -0.32, conf: 0.91, id: 'p1' } },
  // After the first replan (0,2,7 → 2,5,7) the person walks into the upper corridor.
  { at: (s) => s.phase === 'drive' && s.replans === 1 && s.route.seg >= 1 && s.robot.x > NODES[2].x + 0.08, walk: { id: 'p1', x: 4.55, y: 1.62, dur: 0.6 } },
];

export function createRouteSim({ interactive = false } = {}) {
  const s = {};
  let uid = 0;

  function reset() {
    Object.assign(s, {
      t: 0, phase: 'prescan', phaseT: 0, leg: 0, goal: GOAL, from: START,
      robot: { x: NODES[START].x, y: NODES[START].y, th: 0, v: 0, speed: 1 },
      objects: [], ann: annotateGraph([]), heat: new Map(),
      route: null, oldRoutes: [], recorded: null, replans: 0, delta: 0,
      events: [], nextMonitor: 0, nextFusion: 0, scriptDone: new Set(), trail: [],
      arrivedAt: -1, done: false, holdUntil: 0,
    });
    uid = 0;
    log('prescan', 'Prescan · 360° spin');
  }

  function log(type, text, extra) { s.events.push({ t: s.t, type, text, ...extra }); if (s.events.length > 60) s.events.shift(); }

  function spawn({ cls, x, y, conf, id, user = false }) {
    const o = { id: id || `o${++uid}`, cls, mobility: CLASSES[cls], x, y, conf, hits: 0, tSpawn: s.t, tStable: -1, user, mapX: x, mapY: y };
    s.objects.push(o);
    if (user) {
      const users = s.objects.filter((u) => u.user && !u.gone);
      if (users.length > 6) expire(users[0], 'oldest drop removed');
    }
    return o;
  }

  function expire(o, why) { o.gone = s.t; log('ttl', `${o.cls} removed · ${why}`); commit(); }

  /** Re-annotate the graph from persisted objects and remember per-edge changes for the heat animation. */
  function commit() {
    const live = s.objects.filter((o) => o.tStable >= 0 && !o.gone).map((o) => ({ x: o.mapX, y: o.mapY, mobility: o.mobility, conf: o.conf }));
    const next = annotateGraph(live);
    for (const [k, e] of next) {
      const prev = s.ann.get(k);
      if (Math.abs(prev.penalty - e.penalty) > 1e-6) s.heat.set(k, { from: prev.penalty, to: e.penalty, t: s.t });
    }
    s.ann = next;
  }

  const nearestNode = (p) => {
    let best = null, bd = Infinity;
    for (const id of Object.keys(NODES)) { const n = NODES[id]; const d = Math.hypot(n.x - p.x, n.y - p.y); if (d < bd) { bd = d; best = Number(id); } }
    return best;
  };

  /** ComputeRoute from the nearest node; the robot pose is prepended (path-gap correction). */
  function compute(reason) {
    const startNode = nearestNode(s.robot);
    const r = computeRoute(s.ann, [startNode, startNode], 0, s.goal);
    const pts = [{ x: s.robot.x, y: s.robot.y }];
    const keys = [];
    let last = null;
    for (const n of r.nodes) {
      const p = NODES[n];
      if (Math.hypot(p.x - pts[pts.length - 1].x, p.y - pts[pts.length - 1].y) > 0.02) { pts.push({ x: p.x, y: p.y }); keys.push(last === null ? null : edgeKey(last, n)); }
      last = n;
    }
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    if (s.route) s.oldRoutes.push({ ...s.route, tGone: s.t });
    s.route = { nodes: r.nodes, pts, cum, keys, total: cum[cum.length - 1], cost: r.cost, length: r.length, penalty: r.penalty, routeKeys: r.keys, t: s.t, sp: 0, seg: 0 };
    s.recorded = new Map([...s.ann].map(([k, e]) => [k, e.penalty]));
    s.nextMonitor = s.t + MONITOR;
    // FollowPath restarts after a short beat so the new route can draw in.
    s.holdUntil = s.t + (reason === 'replan' ? REPLAN_HOLD : 0.5);
    if (reason === 'replan') {
      s.replans++;
      const prev = s.oldRoutes[s.oldRoutes.length - 1];
      log('replan', `REPLAN #${s.replans}`, { from: prev.nodes, to: r.nodes, n: s.replans });
    } else log('compute', `ComputeRoute → [${r.nodes.join(', ')}]`);
  }

  /** Keys of the edges still ahead on the active route (current segment included). */
  function remainingKeys() {
    const r = s.route; if (!r) return [];
    return r.keys.slice(r.seg).filter(Boolean);
  }

  function monitorDelta() {
    if (!s.route || !s.recorded) return 0;
    let d = 0;
    for (const k of remainingKeys()) d = Math.max(d, Math.abs(s.ann.get(k).penalty - s.recorded.get(k)));
    return d;
  }

  /** Pure-pursuit step of a differential-drive robot along the active route polyline. */
  function drive(dt) {
    const r = s.route, R = s.robot;
    // Project the robot onto the polyline near its current segment.
    let best = { d: Infinity, sp: r.sp, seg: r.seg };
    for (let i = Math.max(0, r.seg - 1); i < Math.min(r.pts.length - 1, r.seg + 2); i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1e-9;
      const u = Math.max(0, Math.min(1, ((R.x - a.x) * dx + (R.y - a.y) * dy) / l2));
      const d = Math.hypot(R.x - a.x - u * dx, R.y - a.y - u * dy);
      const sp = r.cum[i] + u * Math.sqrt(l2);
      if (d < best.d - 1e-6 && sp >= r.sp - 0.05) best = { d, sp, seg: i };
    }
    r.sp = Math.max(r.sp, best.sp); r.seg = best.seg;
    const end = r.pts[r.pts.length - 1];
    if (Math.hypot(end.x - R.x, end.y - R.y) < 0.05) return true;

    const c = pointAt(r, Math.min(r.total, r.sp + LOOKAHEAD));
    let a = Math.atan2(c.y - R.y, c.x - R.x) - R.th;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    const key = r.keys[r.seg] || r.keys[r.seg + 1];
    R.speed = key ? s.ann.get(key).speed : 1;     // AdjustSpeedLimit from edge metadata
    let w, v;
    if (Math.abs(a) > 0.6) { w = Math.sign(a) * W_MAX; v = 0; }
    else { w = Math.max(-W_MAX, Math.min(W_MAX, 4 * a)); v = V_MAX * R.speed * (1 - Math.abs(a) / 0.9); }
    const remain = Math.hypot(end.x - R.x, end.y - R.y);
    v = Math.min(v, 0.25 + remain * 1.5);
    R.th += w * dt;
    R.x += Math.cos(R.th) * v * dt;
    R.y += Math.sin(R.th) * v * dt;
    R.v = v;
    return false;
  }

  function step(dt = STEP) {
    if (s.done) return;
    s.t += dt; s.phaseT += dt;

    // Scripted events (first leg only).
    if (s.leg === 0) {
      SCRIPT.forEach((ev, i) => {
        if (s.scriptDone.has(i) || !ev.at(s)) return;
        s.scriptDone.add(i);
        if (ev.spawn) spawn(ev.spawn);
        if (ev.walk) {
          const o = s.objects.find((x) => x.id === ev.walk.id);
          if (o) { o.walk = { fx: o.x, fy: o.y, tx: ev.walk.x, ty: ev.walk.y, t0: s.t, dur: ev.walk.dur }; log('track', `${o.cls} moving · position overwritten`); }
        }
      });
    }

    // Object tracking: walking targets, fusion hits, persistence into the semantic map.
    for (const o of s.objects) {
      if (o.gone) continue;
      if (o.walk) {
        const k = Math.min(1, (s.t - o.walk.t0) / o.walk.dur);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        o.x = o.walk.fx + (o.walk.tx - o.walk.fx) * e; o.y = o.walk.fy + (o.walk.ty - o.walk.fy) * e;
        if (k >= 1) { o.walk = null; o.mapX = o.x; o.mapY = o.y; log('geojson', `semantic_objects.geojson ← ${o.cls} @ (${o.x.toFixed(1)}, ${o.y.toFixed(1)})`); commit(); }
      }
    }
    if (s.t >= s.nextFusion) {
      s.nextFusion = s.t + 1 / FUSION_HZ;
      for (const o of s.objects) {
        if (o.gone || o.tStable >= 0) continue;
        o.hits++;
        if (o.hits >= STABLE_HITS) {
          o.tStable = s.t;
          log('geojson', `semantic_objects.geojson ← ${o.cls} (${o.mobility})`, { cls: o.cls });
          commit();
        }
      }
    }

    const R = s.robot;
    if (s.phase === 'prescan') {
      R.th = Math.min(1, s.phaseT / PRESCAN) * Math.PI * 2;
      if (s.phaseT >= PRESCAN) { R.th = 0; s.phase = 'reload'; s.phaseT = 0; log('reload', 'set_route_graph · graph reloaded'); }
    } else if (s.phase === 'reload') {
      if (s.phaseT >= RELOAD) { compute('initial'); s.phase = 'drive'; s.phaseT = 0; }
    } else if (s.phase === 'drive') {
      s.delta = monitorDelta();
      const nearGoal = Math.hypot(NODES[s.goal].x - R.x, NODES[s.goal].y - R.y) < NEAR_GOAL;
      if (s.t >= s.nextMonitor) {
        s.nextMonitor = s.t + MONITOR;
        if (!nearGoal && s.delta > DELTA) { log('cancel', `Δp ${s.delta.toFixed(1)} > δ ${DELTA.toFixed(1)} · FollowPath cancelled`); compute('replan'); s.delta = 0; }
      }
      if (s.t < s.holdUntil) R.v = 0;
      else if (drive(STEP)) {
        s.phase = 'goal'; s.phaseT = 0; s.arrivedAt = s.t; R.v = 0;
        log('goal', s.goal === GOAL ? 'Goal reached · node 7' : 'Start reached · node 0');
      }
    } else if (s.phase === 'goal') {
      if (s.phaseT >= GOAL_HOLD) {
        if (!interactive) { s.done = true; return; }
        // Interactive: shuttle forward/return legs like the paper's runs; scripted person expires (TTL).
        s.leg++;
        s.objects.filter((o) => !o.user && o.mobility === 'dynamic' && !o.gone).forEach((o) => expire(o, 'TTL expired'));
        s.goal = s.goal === GOAL ? START : GOAL;
        s.phase = 'reload'; s.phaseT = RELOAD - 0.2;
        s.route = null; s.oldRoutes = [];
      }
    }

    // Trail (sampled every ~0.08 m).
    const tl = s.trail[s.trail.length - 1];
    if (!tl || Math.hypot(tl.x - R.x, tl.y - R.y) > 0.08) { s.trail.push({ x: R.x, y: R.y, t: s.t }); if (s.trail.length > 160) s.trail.shift(); }
    s.oldRoutes = s.oldRoutes.filter((o) => s.t - o.tGone < 2);
  }

  /** User drop (interactive): an obstacle of `cls` at map point (x, y). */
  function drop(cls, x, y) {
    const o = spawn({ cls, x, y, conf: 0.9, user: true });
    log('detect', `${cls} detected · tracking`);
    return o;
  }

  function clearUser() { s.objects.filter((o) => o.user && !o.gone).forEach((o) => { o.gone = s.t; }); log('ttl', 'User obstacles cleared'); commit(); }

  reset();
  return { state: s, reset, step, drop, clearUser };
}

export function pointAt(r, sp) {
  let i = 0;
  while (i < r.cum.length - 2 && r.cum[i + 1] < sp) i++;
  const a = r.pts[i], b = r.pts[i + 1] || a;
  const l = (r.cum[i + 1] ?? r.cum[i]) - r.cum[i] || 1e-9;
  const u = Math.max(0, Math.min(1, (sp - r.cum[i]) / l));
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

/** Runs a fresh non-interactive sim to the end and returns its duration (for setProgress). */
export function measureScript() {
  const sim = createRouteSim();
  let n = 0;
  while (!sim.state.done && n < 60 * 120) { sim.step(); n++; }
  return { duration: sim.state.t, replans: sim.state.replans, events: sim.state.events };
}
