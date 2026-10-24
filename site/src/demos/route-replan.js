// route-replan: semantic route planning with the Nav2 Route Server, as in Sensors 2026, 26, 2232.
// A robot drives the FIIR corridor graph (7 nodes, 10 edge pairs); detections are classified by mobility,
// persisted to the GeoJSON semantic map and turned into edge penalties; when an edge of the active route
// changes by more than δ = 2.0 the route is recomputed and the new path draws in.
//
// Options: bare, compact, theme ('dark' | 'paper'), height, aspect, interactive (click to drop obstacles).
// Returned API: play(), pause(), destroy(), setProgress(p | null) for scroll scrubbing (null resumes autoplay).

import { createShell, createCanvas, createLoop, legendItem, el, mix, withAlpha, clamp, easeOut, easeBack, easeInOut } from './navigation/shell.js';
import { NODES, EDGES, START, GOAL, MOBILITY, DELTA, PROXIMITY, edgeKey } from './navigation/route-graph.js';
import { createRouteSim, measureScript, pointAt, STEP } from './navigation/route-sim.js';

// Map-frame window drawn on screen (m). The corridor drawing is stylised around the paper's graph.
const VIEW = { x0: -0.25, x1: 7.95, y0: -2.15, y1: 2.35 };
const WALLS = [
  // [x1, y1, x2, y2] wall runs, gaps are doors / openings
  [0.1, 2.15, 1.1, 2.15], [1.9, 2.15, 5.3, 2.15], [6.1, 2.15, 7.7, 2.15],
  [0.1, -1.95, 3.7, -1.95], [4.5, -1.95, 7.7, -1.95],
  [0.1, -1.95, 0.1, -0.65], [0.1, 0.65, 0.1, 2.15],
  [7.7, -1.95, 7.7, -0.55], [7.7, 0.55, 7.7, 2.15],
];
const DOORS = [[1.1, 2.15, 0.8, -1], [5.3, 2.15, 0.8, -1], [3.7, -1.95, 0.8, 1]];
const FURNITURE = [
  { type: 'rect', x: 2.3, y: -1.86, w: 1.0, h: 0.38 },          // bench along the lower wall
  { type: 'rect', x: 5.02, y: -1.86, w: 0.46, h: 0.46 },        // chairs
  { type: 'rect', x: 5.56, y: -1.86, w: 0.46, h: 0.46 },
  { type: 'rect', x: 3.0, y: 1.72, w: 1.5, h: 0.36 },           // cabinet
  { type: 'circle', x: 0.55, y: 1.7, r: 0.22 },                 // potted plants
  { type: 'circle', x: 7.25, y: 1.72, r: 0.22 },
  { type: 'circle', x: 0.55, y: -1.5, r: 0.22 },
  { type: 'rect', x: 6.6, y: -1.86, w: 0.9, h: 0.5 },           // table
];
const CLASS_CYCLE = ['person', 'chair', 'bottle'];
const MONO = '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace';

export default function mount(host, { options = {}, reducedMotion = false } = {}) {
  const interactive = !!options.interactive && !reducedMotion;
  const shell = createShell(host, {
    title: options.title || 'Nav2 Route Server · semantic replanning',
    label: 'Animated top-down map of the FIIR corridor navigation graph: a robot follows a route between the start and goal nodes, '
      + 'detected objects are classified as dynamic, static or minor, nearby graph edges receive penalties, and when the penalty change '
      + 'on the active route exceeds the threshold of 2.0 the route is recomputed.',
    options,
    aspect: (w) => (w < 520 ? 0.62 : w < 900 ? 1.3 : 1.8),
  });
  const { stage, palette: P, compact } = shell;
  shell.root.classList.add('rr');
  if (interactive) shell.root.classList.add('rr--interactive');

  if (shell.legend) {
    shell.legend.append(
      legendItem(P.dynamic, 'dynamic +50 · v≤30%'),
      legendItem(P.static, 'static +15 · v≤60%'),
      legendItem(P.minor, 'minor +5 · v≤90%'),
      legendItem(P.route, 'active route', 'line'),
    );
  }

  // ---------- DOM HUD ----------
  const hud = el('div', 'navd__hud');
  const tl = el('div', 'rr__box rr__tl');
  const phaseEl = el('div', 'rr__phase', 'prescan');
  const routeEl = el('div', 'rr__route');
  const costEl = el('div', 'rr__cost');
  tl.append(phaseEl, routeEl, costEl);
  const tr = el('div', 'rr__box rr__tr');
  const countEl = el('div', 'rr__count', '0');
  tr.append(el('div', 'tag', 'Replans'), countEl);
  const bl = el('div', 'rr__box rr__bl');
  const meterLabel = el('div', 'rr__meterlabel');
  const meter = el('div', 'rr__meter', '<i></i><u></u>');
  bl.append(meterLabel, meter);
  const br = el('div', 'rr__box rr__br');
  const logRows = Array.from({ length: 4 }, () => el('div', 'rr__log'));
  br.append(el('div', 'tag', 'Event log'), ...logRows);
  const toast = el('div', 'rr__toast', '<strong></strong><span></span>');
  toast.setAttribute('aria-live', 'polite');
  hud.append(tl, tr, bl, br, toast);
  stage.append(hud);
  const meterFill = meter.querySelector('i');

  // ---------- Simulation state ----------
  const script = measureScript();
  const DURATION = script.duration;
  const sim = createRouteSim({ interactive });
  let acc = 0, scrub = null, fade = 0, resetting = false, ready = false;
  let dropIndex = 0, hover = null, setClassBtn = () => {};
  const CLASSES_MOB = { person: 'dynamic', chair: 'static', bottle: 'minor' };

  // ---------- Canvas + cached floor plan ----------
  const bg = document.createElement('canvas');
  let view = { k: 1, cx: 0, cy: 0, rot: false };
  const cv = createCanvas(stage, (w, h) => {
    if (!ready) return;
    const narrow = w < 640;
    shell.root.classList.toggle('rr--narrow', narrow);
    shell.root.classList.toggle('rr--tiny', w < 380);
    layout(w, h);
    paintFloor();
    render();
  });

  function layout(w, h) {
    const rot = h > w * 1.08;
    const small = compact || w < 640;
    const padX = small ? 10 : 22;
    const top = rot ? (small ? 86 : 104) : (small ? 50 : 74);
    const bottom = rot ? (small ? 64 : 76) : (small ? 34 : 64);
    const ww = rot ? VIEW.y1 - VIEW.y0 : VIEW.x1 - VIEW.x0;
    const wh = rot ? VIEW.x1 - VIEW.x0 : VIEW.y1 - VIEW.y0;
    const aw = w - padX * 2, ah = h - top - bottom;
    const k = Math.max(8, Math.min(aw / ww, ah / wh));
    view = { k, rot, cx: padX + aw / 2, cy: top + ah / 2, w, h };
  }
  const XM = (VIEW.x0 + VIEW.x1) / 2, YM = (VIEW.y0 + VIEW.y1) / 2;
  const S = (x, y) => (view.rot
    ? [view.cx - (y - YM) * view.k, view.cy - (x - XM) * view.k]
    : [view.cx + (x - XM) * view.k, view.cy - (y - YM) * view.k]);
  const W = (sx, sy) => (view.rot
    ? { x: XM - (sy - view.cy) / view.k, y: YM - (sx - view.cx) / view.k }
    : { x: XM + (sx - view.cx) / view.k, y: YM - (sy - view.cy) / view.k });
  /** Screen angle of a world heading. */
  const SA = (th) => (view.rot ? Math.atan2(-Math.cos(th), -Math.sin(th)) : -th);
  const px = (m) => m * view.k;
  const fs = (base) => Math.round(clamp(base * (view.k / 110), base * 0.78, base * 1.15));

  function paintFloor() {
    const { w, h } = cv, dpr = cv.dpr;
    bg.width = cv.canvas.width; bg.height = cv.canvas.height;
    const c = bg.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = P.bg; c.fillRect(0, 0, w, h);
    // Blueprint grid: 0.25 m minor, 1 m major, anchored to the map frame.
    const step = 0.25;
    for (let pass = 0; pass < 2; pass++) {
      c.strokeStyle = pass ? P.gridMajor : P.grid; c.lineWidth = 1;
      c.beginPath();
      for (let gx = Math.floor(VIEW.x0 - 6); gx <= VIEW.x1 + 6; gx += step) {
        if (pass !== (Math.abs(gx - Math.round(gx)) < 1e-6 ? 1 : 0)) continue;
        const [ax, ay] = S(gx, VIEW.y0 - 8), [bx, by] = S(gx, VIEW.y1 + 8);
        c.moveTo(Math.round(ax) + 0.5, Math.round(ay) + 0.5); c.lineTo(Math.round(bx) + 0.5, Math.round(by) + 0.5);
      }
      for (let gy = Math.floor(VIEW.y0 - 8); gy <= VIEW.y1 + 8; gy += step) {
        if (pass !== (Math.abs(gy - Math.round(gy)) < 1e-6 ? 1 : 0)) continue;
        const [ax, ay] = S(VIEW.x0 - 6, gy), [bx, by] = S(VIEW.x1 + 6, gy);
        c.moveTo(Math.round(ax) + 0.5, Math.round(ay) + 0.5); c.lineTo(Math.round(bx) + 0.5, Math.round(by) + 0.5);
      }
      c.stroke();
    }
    // Floor slab
    const [fx0, fy0] = S(0.1, 2.15), [fx1, fy1] = S(7.7, -1.95);
    c.fillStyle = P.wallFill;
    c.fillRect(Math.min(fx0, fx1), Math.min(fy0, fy1), Math.abs(fx1 - fx0), Math.abs(fy1 - fy0));
    // Walls: thick strokes with hatch marks
    c.lineCap = 'square';
    for (const [x1, y1, x2, y2] of WALLS) {
      const [a, b] = S(x1, y1), [d, e] = S(x2, y2);
      c.strokeStyle = P.wall; c.lineWidth = Math.max(2, px(0.07));
      c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.stroke();
      c.strokeStyle = P.hatch; c.lineWidth = 1;
      const L = Math.hypot(d - a, e - b), n = Math.floor(L / 7);
      c.beginPath();
      for (let i = 0; i <= n; i++) { const u = i / Math.max(1, n); const sx = a + (d - a) * u, sy = b + (e - b) * u; c.moveTo(sx - 3, sy + 3); c.lineTo(sx + 3, sy - 3); }
      c.stroke();
    }
    // Door swings
    c.setLineDash([3, 3]); c.strokeStyle = P.furniture; c.lineWidth = 1;
    for (const [x, y, wdt, dir] of DOORS) {
      const [a, b] = S(x, y), [d, e] = S(x, y + dir * wdt);
      c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.stroke();
      const r = px(wdt), a0 = Math.atan2(e - b, d - a), [g, hh] = S(x + wdt, y), a1 = Math.atan2(hh - b, g - a);
      c.beginPath(); c.arc(a, b, r, Math.min(a0, a1), Math.max(a0, a1)); c.stroke();
    }
    c.setLineDash([]);
    // Furniture outlines
    c.strokeStyle = P.furniture; c.lineWidth = 1;
    for (const f of FURNITURE) {
      c.beginPath();
      if (f.type === 'rect') {
        const [a, b] = S(f.x, f.y), [d, e] = S(f.x + f.w, f.y + f.h);
        c.rect(Math.min(a, d), Math.min(b, e), Math.abs(d - a), Math.abs(e - b));
      } else { const [a, b] = S(f.x, f.y); c.arc(a, b, px(f.r), 0, Math.PI * 2); }
      c.stroke();
    }
    // Labels: plan title, scale bar, axes
    c.fillStyle = P.mute; c.font = `500 ${fs(10)}px ${MONO}`; c.textBaseline = 'alphabetic';
    if (!compact) {
      const [lx, ly] = view.rot ? S(7.55, 2.0) : S(0.3, -1.75);
      c.fillText('FIIR · 2F CORRIDOR · MAP FRAME (m)', view.rot ? lx - 2 : lx + 2, view.rot ? ly + 14 : ly);
    }
    const [sx0, sy0] = [view.w - (compact ? 12 : 24) - px(1), view.h - (compact ? 10 : 18) - (compact ? 0 : 0)];
    if (!compact && !view.rot) {
      c.strokeStyle = P.dim; c.lineWidth = 1.2;
      const yb = view.cy + px((VIEW.y1 - VIEW.y0) / 2) + 2;
      c.beginPath(); c.moveTo(sx0, yb); c.lineTo(sx0 + px(1), yb); c.moveTo(sx0, yb - 4); c.lineTo(sx0, yb + 4); c.moveTo(sx0 + px(1), yb - 4); c.lineTo(sx0 + px(1), yb + 4); c.stroke();
      c.fillText('1 m', sx0 + px(1) / 2 - 10, yb - 7);
    }
    // HUD corner brackets
    c.strokeStyle = P.line; c.lineWidth = 1.5;
    const m = compact ? 4 : 8, L = compact ? 10 : 16;
    for (const [x, y, dx, dy] of [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]]) {
      c.beginPath(); c.moveTo(x, y + dy * L); c.lineTo(x, y); c.lineTo(x + dx * L, y); c.stroke();
    }
  }

  function simTo(t) {
    if (t < sim.state.t) sim.reset();
    while (sim.state.t + STEP <= t && !sim.state.done) sim.step();
  }

  // ---------- Drawing ----------
  const ctx = cv.ctx;
  const heatColor = (p) => (p < 8 ? mix(P.minor, P.static, p / 8) : mix(P.static, P.dynamic, clamp((p - 8) / 22)));

  function displayedPenalty(key) {
    const s = sim.state, e = s.ann.get(key), h = s.heat.get(key);
    if (!h) return e.penalty;
    const k = easeOut((s.t - h.t) / 0.7);
    return h.from + (h.to - h.from) * k;
  }

  function polyline(pts, from = 0, to = Infinity, cum) {
    // Returns screen points of the sub-path between arc lengths [from, to].
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const s0 = cum[i];
      if (s0 >= from && s0 <= to) out.push(S(pts[i].x, pts[i].y));
      if (i < pts.length - 1) {
        const s1 = cum[i + 1];
        if (from > s0 && from < s1) { const p = pointAt({ pts, cum }, from); out.push(S(p.x, p.y)); }
        if (to > s0 && to < s1) { const p = pointAt({ pts, cum }, to); out.push(S(p.x, p.y)); break; }
      }
    }
    return out;
  }
  function strokePts(pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }

  function drawEdges() {
    const s = sim.state;
    for (const [i, j] of EDGES) {
      const key = edgeKey(i, j);
      const [ax, ay] = S(NODES[i].x, NODES[i].y), [bx, by] = S(NODES[j].x, NODES[j].y);
      const p = displayedPenalty(key);
      const h = s.heat.get(key);
      const pulse = h ? clamp(1 - (s.t - h.t) / 0.9) : 0;
      ctx.lineCap = 'round';
      ctx.strokeStyle = P.edge; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      if (p > 0.3 || pulse > 0) {
        const hot = clamp(p / 30);
        const col = heatColor(p);
        ctx.globalCompositeOperation = P.blend;
        ctx.strokeStyle = col.replace(/[\d.]+\)$/, `${0.16 + 0.3 * pulse})`);
        ctx.lineWidth = 8 + 14 * hot + 10 * pulse;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = col; ctx.lineWidth = 1.8 + 4.5 * hot;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        // Penalty label on the edge
        if (p > 0.5 && (!compact || p > 10)) {
          const mx = (ax + bx) / 2, my = (ay + by) / 2;
          const nx = -(by - ay), ny = bx - ax, nl = Math.hypot(nx, ny) || 1;
          const off = 11;
          const tx = mx + (nx / nl) * off, ty = my + (ny / nl) * off;
          const txt = `p ${p.toFixed(1)}`;
          ctx.font = `600 ${fs(compact ? 9 : 10)}px ${MONO}`;
          const tw = ctx.measureText(txt).width;
          ctx.fillStyle = withAlpha(P.bg, 0.86);
          ctx.fillRect(tx - tw / 2 - 4, ty - 7, tw + 8, 14);
          ctx.fillStyle = col.replace(/[\d.]+\)$/, '1)');
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(txt, tx, ty + 0.5);
          ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        }
      }
    }
  }

  function drawRoutes() {
    const s = sim.state;
    // Old routes dissolve: fading, breaking into widening dashes, sparks drifting off.
    for (const o of s.oldRoutes) {
      const e = clamp((s.t - o.tGone) / 1.1);
      if (e >= 1) continue;
      const pts = polyline(o.pts, o.sp, Infinity, o.cum);
      ctx.save();
      ctx.globalAlpha = (1 - e) * 0.9;
      ctx.setLineDash([Math.max(1, 10 * (1 - e)), 4 + 22 * e]);
      ctx.lineDashOffset = -e * 30;
      ctx.strokeStyle = P.route; ctx.lineWidth = 3 * (1 - e) + 1;
      strokePts(pts);
      ctx.setLineDash([]);
      ctx.fillStyle = P.route;
      for (let i = 0; i < 26; i++) {
        const u = (i * 0.618) % 1;
        const p = pointAt(o, o.sp + (o.total - o.sp) * u);
        const [x, y] = S(p.x, p.y);
        const a = i * 2.4, d = e * (10 + (i % 5) * 6);
        ctx.globalAlpha = (1 - e) * 0.8;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d - e * 8, 1.6 * (1 - e) + 0.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    const r = s.route;
    if (!r) return;
    const draw = easeInOut((s.t - r.t) / 0.9);
    const end = r.total * draw;
    const ahead = polyline(r.pts, r.sp, end, r.cum);
    const behind = polyline(r.pts, 0, Math.min(r.sp, end), r.cum);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = P.travelled; ctx.lineWidth = 2; ctx.setLineDash([2, 5]);
    strokePts(behind); ctx.setLineDash([]);
    ctx.globalCompositeOperation = P.blend;
    ctx.strokeStyle = P.routeGlow; ctx.lineWidth = compact ? 9 : 13; strokePts(ahead);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = P.route; ctx.lineWidth = compact ? 2.6 : 3.4; strokePts(ahead);
    ctx.strokeStyle = P.routeCore; ctx.lineWidth = 1.3; ctx.setLineDash([2, 9]); ctx.lineDashOffset = -s.t * 28;
    strokePts(ahead); ctx.setLineDash([]);
    // Drawing head while the new route draws in
    if (draw < 1) {
      const p = pointAt(r, end); const [x, y] = S(p.x, p.y);
      ctx.fillStyle = P.routeCore; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = P.blend; ctx.fillStyle = P.routeGlow; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawNodes() {
    const s = sim.state;
    const onRoute = new Set(s.route ? s.route.nodes : []);
    const r = clamp(view.k * 0.075, 4, 7.5);
    ctx.font = `600 ${fs(compact ? 9 : 11)}px ${MONO}`;
    for (const id of Object.keys(NODES)) {
      const n = NODES[id], nid = Number(id);
      const [x, y] = S(n.x, n.y);
      const term = nid === START || nid === GOAL;
      if (term) {
        ctx.strokeStyle = nid === s.goal ? P.route : P.dim; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, y, r + 5 + (nid === s.goal ? Math.sin(s.t * 3) * 1.5 : 0), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = onRoute.has(nid) ? P.route : P.nodeFill;
      ctx.strokeStyle = onRoute.has(nid) ? P.routeCore : P.node; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const label = term && !compact ? `${id} ${n.name}` : id;
      ctx.fillStyle = P.dim;
      const off = view.rot ? [r + 6, 4] : [r * 0.6 + 3, -r - 5];
      ctx.fillText(label, x + off[0], y + off[1]);
    }
  }

  const ICON = {
    person(x, y, sc, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 0.2 * sc, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = P.bg; ctx.beginPath(); ctx.arc(x, y, 0.08 * sc, 0, Math.PI * 2); ctx.fill(); },
    chair(x, y, sc, col) { const h = 0.2 * sc; ctx.fillStyle = col; ctx.fillRect(x - h, y - h, h * 2, h * 2); ctx.fillStyle = P.bg; ctx.fillRect(x - h * 0.6, y - h * 0.3, h * 1.2, h * 1.1); },
    bench(x, y, sc, col) { ctx.fillStyle = col; ctx.fillRect(x - 0.45 * sc, y - 0.16 * sc, 0.9 * sc, 0.32 * sc); },
    bottle(x, y, sc, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 0.09 * sc, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 0.16 * sc, 0, Math.PI * 2); ctx.stroke(); },
  };

  function drawObjects() {
    const s = sim.state, R = s.robot;
    const sc = Math.max(view.k, 40);
    for (const o of s.objects) {
      const gone = o.gone != null ? clamp((s.t - o.gone) / 0.6) : 0;
      if (gone >= 1) continue;
      const col = P[o.mobility];
      const [x, y] = S(o.x, o.y);
      const pop = easeBack((s.t - o.tSpawn) / 0.45);
      ctx.save();
      ctx.globalAlpha = 1 - gone;
      if (o.tStable < 0) {
        // Tracking: ASF sector ray from the robot and a dashed bracket with hit pips
        const [rx, ry] = S(R.x, R.y);
        ctx.strokeStyle = withAlpha(P.cyan, 0.45); ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
        const b = 14 * pop;
        ctx.strokeStyle = P.cyan; ctx.lineWidth = 1.5;
        for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          ctx.beginPath(); ctx.moveTo(x + dx * b, y + dy * b * 0.45); ctx.lineTo(x + dx * b, y + dy * b); ctx.lineTo(x + dx * b * 0.45, y + dy * b); ctx.stroke();
        }
        for (let i = 0; i < 3; i++) { ctx.fillStyle = i < o.hits ? P.cyan : withAlpha(P.cyan, 0.25); ctx.fillRect(x - 9 + i * 7, y + b + 5, 5, 3); }
      } else {
        // Persisted: proximity ripple, influence ring, mobility marker
        const age = s.t - o.tStable;
        const ring = px(PROXIMITY);
        if (age < 1) {
          ctx.strokeStyle = col; ctx.lineWidth = 2 * (1 - age) + 0.5; ctx.globalAlpha = (1 - gone) * (1 - age);
          ctx.beginPath(); ctx.arc(x, y, ring * easeOut(age), 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1 - gone;
        }
        const g = ctx.createRadialGradient(x, y, 0, x, y, ring);
        g.addColorStop(0, withAlpha(col, 0.16)); g.addColorStop(1, withAlpha(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, ring, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = withAlpha(col, 0.32); ctx.lineWidth = 1; ctx.setLineDash([2, 5]);
        ctx.beginPath(); ctx.arc(x, y, ring, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
      // Walking ghost trail (dynamic objects get their position overwritten)
      if (o.walk) {
        const [fx, fy] = S(o.walk.fx, o.walk.fy);
        ctx.strokeStyle = withAlpha(col, 0.5); ctx.setLineDash([2, 4]); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.translate(x, y); ctx.scale(pop, pop); ctx.translate(-x, -y);
      (ICON[o.cls] || ICON.bottle)(x, y, sc, o.tStable < 0 ? P.cyan : col);
      ctx.restore();
      drawTag(o, x, y, col, gone);
    }
  }

  function drawTag(o, x, y, col, gone) {
    const s = sim.state;
    const tracking = o.tStable < 0;
    const k = easeOut((s.t - o.tSpawn) / 0.35);
    const l1 = tracking ? `${o.cls} ${o.conf.toFixed(2)}` : `${o.cls} · ${o.mobility}`;
    const m = MOBILITY[o.mobility];
    const l2 = tracking ? `tracking ${o.hits}/3` : `+${m.base} · v≤${Math.round(m.speed * 100)}%`;
    const small = compact || view.w < 520;
    ctx.save();
    ctx.globalAlpha = k * (1 - gone);
    ctx.font = `600 ${fs(small ? 9 : 10)}px ${MONO}`;
    const lw = Math.max(ctx.measureText(l1.toUpperCase()).width, small ? 0 : ctx.measureText(l2.toUpperCase()).width);
    const bw = lw + 14, bh = small ? 17 : 31;
    let bx = x + 14, by = y - bh - 12;
    if (bx + bw > view.w - 6) bx = x - 14 - bw;
    if (by < 6) by = y + 14;
    ctx.fillStyle = withAlpha(P.bg2, 0.92);
    ctx.strokeStyle = tracking ? P.cyan : col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = tracking ? P.cyan : col; ctx.fillRect(bx, by, 3, bh);
    ctx.fillStyle = P.fg; ctx.textBaseline = 'top';
    ctx.fillText(l1.toUpperCase(), bx + 8, by + 4);
    if (!small) { ctx.fillStyle = P.dim; ctx.font = `500 ${fs(9)}px ${MONO}`; ctx.fillText(l2.toUpperCase(), bx + 8, by + 17); }
    ctx.restore();
  }

  function drawRobot() {
    const s = sim.state, R = s.robot;
    const [x, y] = S(R.x, R.y);
    const a = SA(R.th);
    // Trail
    for (const p of s.trail) {
      const age = clamp((s.t - p.t) / 10);
      const [tx, ty] = S(p.x, p.y);
      ctx.fillStyle = withAlpha(P.mint, 0.35 * (1 - age));
      ctx.fillRect(tx - 1, ty - 1, 2, 2);
    }
    ctx.save();
    ctx.translate(x, y); ctx.rotate(a);
    // Camera FOV wedge (±24.9°)
    const fov = 24.9 * Math.PI / 180, L = px(2.4);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, L);
    g.addColorStop(0, withAlpha(P.amber, 0.22)); g.addColorStop(1, withAlpha(P.amber, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, L, -fov, fov); ctx.closePath(); ctx.fill();
    // LiDAR sweep (10 Hz scanner drawn slower so the eye can follow), wider during the prescan
    const sweep = s.t * 7;
    const Ls = px(s.phase === 'prescan' ? 2.8 : 1.3);
    const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, Ls);
    sg.addColorStop(0, withAlpha(P.cyan, 0.25)); sg.addColorStop(1, withAlpha(P.cyan, 0));
    ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, Ls, sweep - 0.7, sweep); ctx.closePath(); ctx.fill();
    // Body: 4WD differential platform, front marked
    const bwid = Math.max(px(0.44), 14), bh = Math.max(px(0.36), 11.5);
    ctx.fillStyle = P.robot;
    const wl = bwid * 0.32, ww = bh * 0.2;
    for (const [wx, wy] of [[-bwid * 0.3, -bh / 2 - ww * 0.6], [bwid * 0.3, -bh / 2 - ww * 0.6], [-bwid * 0.3, bh / 2 + ww * 0.6], [bwid * 0.3, bh / 2 + ww * 0.6]]) ctx.fillRect(wx - wl / 2, wy - ww / 2, wl, ww);
    ctx.fillStyle = P.robotBody; ctx.strokeStyle = P.robot; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.roundRect(-bwid / 2, -bh / 2, bwid, bh, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = P.orange; ctx.beginPath(); ctx.moveTo(bwid / 2 - 1, -bh * 0.28); ctx.lineTo(bwid / 2 + 4, 0); ctx.lineTo(bwid / 2 - 1, bh * 0.28); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = P.cyan; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(-bwid * 0.05, 0, bh * 0.24, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-bwid * 0.05, 0); ctx.lineTo(-bwid * 0.05 + Math.cos(sweep) * bh * 0.24, Math.sin(sweep) * bh * 0.24); ctx.stroke();
    ctx.restore();
    // Replan burst
    const last = [...s.events].reverse().find((e) => e.type === 'replan');
    if (last) {
      const e = (s.t - last.t) / 1.0;
      if (e >= 0 && e < 1) {
        ctx.strokeStyle = withAlpha(P.orange, 1 - e); ctx.lineWidth = 3 * (1 - e) + 0.5;
        ctx.beginPath(); ctx.arc(x, y, 10 + easeOut(e) * px(1.2), 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 10 + easeOut(e * 0.7) * px(0.7), 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  function drawHover() {
    if (!hover || !interactive) return;
    const cls = CLASS_CYCLE[dropIndex];
    const col = P[CLASSES_MOB[cls]];
    const [x, y] = S(hover.x, hover.y);
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = col; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, px(PROXIMITY), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ICON[cls](x, y, Math.max(view.k, 40), col);
    ctx.restore();
  }

  function render() {
    if (!cv.w) return;
    const c = cv.begin();
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(bg, 0, 0); c.restore();
    drawEdges();
    drawRoutes();
    drawObjects();
    drawNodes();
    drawRobot();
    drawHover();
    if (fade > 0) { c.fillStyle = withAlpha(P.bg, clamp(fade)); c.fillRect(0, 0, cv.w, cv.h); }
    updateHud();
  }

  // ---------- HUD updates (only touch the DOM when text changes) ----------
  const cache = {};
  const setText = (node, key, html) => { if (cache[key] !== html) { cache[key] = html; node.innerHTML = html; } };
  function updateHud() {
    const s = sim.state;
    const phase = s.phase === 'prescan' ? 'Prescan · 360° spin'
      : s.phase === 'reload' ? 'set_route_graph · reload'
        : s.phase === 'goal' ? (s.goal === GOAL ? 'Goal reached' : 'Start reached')
          : s.t < s.holdUntil ? 'ComputeRoute'
            : s.robot.speed < 1 ? `FollowPath · v≤${Math.round(s.robot.speed * 100)}%` : 'FollowPath';
    setText(phaseEl, 'phase', phase);
    const r = s.route;
    const route = r ? r.nodes.map((n) => `<b>${n}</b>`).join('<span>→</span>') : '<span>planning…</span>';
    setText(routeEl, 'route', `<span class="tag" style="margin-right:4px">Route</span>${route}`);
    setText(costEl, 'cost', r ? `cost <em>${r.cost.toFixed(1)}</em><span> = len ${r.length.toFixed(1)} m + 5×Σp ${r.penalty.toFixed(1)}</span>` : 'cost <em>·</em>');
    if (cache.count !== s.replans) {
      const bump = cache.count !== undefined && s.replans > cache.count;
      cache.count = s.replans; countEl.textContent = String(s.replans);
      if (bump && !scrub) { countEl.classList.remove('is-bump'); void countEl.offsetWidth; countEl.classList.add('is-bump'); }
    }
    // Δ meter with peak hold so the threshold crossing stays readable after the replan fires.
    const cancel = [...s.events].reverse().find((e) => e.type === 'cancel');
    let d = s.delta;
    if (cancel && s.t - cancel.t < 1.6) d = Math.max(d, parseFloat(cancel.text.match(/Δp ([\d.]+)/)[1]));
    const over = d > DELTA;
    meterFill.style.width = `${clamp(d / 8) * 100}%`;
    meter.classList.toggle('is-over', over);
    setText(meterLabel, 'meter', `<span>Δp on route</span><span><em>${d.toFixed(1)}</em> ${over ? '>' : '≤'} δ ${DELTA.toFixed(1)}</span>`);
    // Log
    const evs = s.events.slice(-4).reverse();
    logRows.forEach((row, i) => {
      const e = evs[i];
      const html = e ? `<b>t+${e.t.toFixed(1).padStart(4, '0')}</b>${e.type === 'replan' ? `${e.text} · [${e.from.join(',')}] → [${e.to.join(',')}]` : e.text}` : '';
      if (row.dataset.html !== html) { row.dataset.html = html; row.innerHTML = html; row.dataset.type = e ? e.type : ''; row.style.opacity = String(1 - i * 0.2); }
    });
    // Toast
    const rp = [...s.events].reverse().find((e) => e.type === 'replan');
    const on = rp && s.t - rp.t < 2.4;
    if (on) setText(toast, 'toast', `<strong>REPLAN #${rp.n}</strong><span>[${rp.from.join('·')}] → [${rp.to.join('·')}]</span>`);
    toast.classList.toggle('is-on', !!on);
  }

  // ---------- Interaction ----------
  if (interactive) {
    const ctrlHost = shell.controls || (() => { const c = el('div', 'rr__box rr__hint'); c.style.pointerEvents = 'auto'; hud.append(c); return c; })();
    const classBtn = el('button', 'navd__btn mono');
    classBtn.type = 'button';
    setClassBtn = () => {
      const cls = CLASS_CYCLE[dropIndex];
      classBtn.style.setProperty('--c', P[CLASSES_MOB[cls]]);
      classBtn.innerHTML = `<i></i>Drop: ${cls}`;
      classBtn.setAttribute('aria-label', `Obstacle class: ${cls} (${CLASSES_MOB[cls]}). Click to change.`);
    };
    classBtn.addEventListener('click', () => { dropIndex = (dropIndex + 1) % CLASS_CYCLE.length; setClassBtn(); render(); });
    const aheadBtn = el('button', 'navd__btn navd__btn--primary mono', 'Drop ahead');
    aheadBtn.type = 'button';
    aheadBtn.setAttribute('aria-label', 'Drop the selected obstacle on the active route ahead of the robot');
    aheadBtn.addEventListener('click', () => {
      const s = sim.state;
      const p = s.route ? pointAt(s.route, Math.min(s.route.total, s.route.sp + 1.4)) : { x: NODES[2].x, y: NODES[2].y };
      dropAt(p.x, p.y + 0.15);
    });
    const clearBtn = el('button', 'navd__btn mono', 'Clear');
    clearBtn.type = 'button';
    clearBtn.addEventListener('click', () => { sim.clearUser(); render(); });
    setClassBtn();
    ctrlHost.append(classBtn, aheadBtn, clearBtn);
    if (!shell.controls) ctrlHost.style.display = 'flex';

    const toWorld = (e) => { const b = cv.canvas.getBoundingClientRect(); return W(e.clientX - b.left, e.clientY - b.top); };
    const inside = (p) => p.x > 0.2 && p.x < 7.6 && p.y > -1.85 && p.y < 2.05;
    cv.canvas.addEventListener('pointermove', (e) => { const p = toWorld(e); hover = inside(p) ? p : null; if (!loop.running) render(); });
    cv.canvas.addEventListener('pointerleave', () => { hover = null; });
    cv.canvas.addEventListener('click', (e) => { const p = toWorld(e); if (inside(p)) dropAt(p.x, p.y); });
  }

  function dropAt(x, y) {
    scrub = null;
    sim.drop(CLASS_CYCLE[dropIndex], x, y);
    dropIndex = (dropIndex + 1) % CLASS_CYCLE.length;
    setClassBtn();
    render();
  }

  // ---------- Clock ----------
  const loop = createLoop((dt) => {
    if (scrub !== null) { render(); return; }
    if (resetting) {
      fade += dt / 0.45;
      if (fade >= 1) { sim.reset(); resetting = false; fade = 1; }
      render(); return;
    }
    if (fade > 0) fade = Math.max(0, fade - dt / 0.45);
    acc += dt;
    while (acc >= STEP) { sim.step(); acc -= STEP; }
    if (sim.state.done) resetting = true;
    render();
  });

  ready = true;
  stage.insertBefore(cv.canvas, hud);
  shell.root.classList.toggle('rr--narrow', cv.w < 640);
  shell.root.classList.toggle('rr--tiny', cv.w < 380);
  layout(cv.w, cv.h);
  paintFloor();
  render();

  if (reducedMotion) {
    // A complete static frame: after the second replan, with the new route drawn and both replans counted.
    const rp = script.events.filter((e) => e.type === 'replan');
    simTo((rp[rp.length - 1]?.t ?? DURATION * 0.6) + 2.6);
    render();
  }

  return {
    play() { if (!reducedMotion) loop.play(); },
    pause() { loop.pause(); },
    /** Scrub the scripted mission: p in 0..1, or null to hand control back to autoplay. */
    setProgress(p) {
      if (p == null) { scrub = null; return; }
      scrub = clamp(p);
      fade = 0; resetting = false;
      simTo(scrub * DURATION);
      if (!loop.running) render();
    },
    get duration() { return DURATION; },
    destroy() { loop.pause(); cv.destroy(); shell.destroy(); },
  };
}
