// Detection layer shared by simulated and real footage:
//  - SimDetector: YOLO26n as it behaves on the Raspberry Pi 5 (NCNN, 5.5 +/- 0.7 FPS, 167 +/- 21 ms per
//    inference). Each inference sees the scene at its capture time and its boxes arrive one latency later.
//  - VideoTracks: plays back a detections JSON recorded on real footage, interpolating between frames.
//  - drawDetections: the box overlay with a lock-on animation, class + confidence labels.

import { YOLO, CLASSES } from './world.js';
import { clamp, easeOut, gauss, rng, rgba } from './common.js';

const FADE = 0.28;      // seconds a lost box takes to fade out
const LOCK = 0.5;       // seconds of lock-on animation for a new box

export class SimDetector {
  /** @param {(t:number)=>Array} candidatesAt ground-truth candidates at a capture time */
  constructor(candidatesAt, seed = 11) {
    this.candidatesAt = candidatesAt;
    this.seed = seed;
    this.reset(0);
  }

  reset(t) {
    this.rand = rng(this.seed);
    this.tracks = new Map();
    this.pending = null;
    this.next = t;
    this.last = t;
    this.fps = YOLO.fps;
    this.ms = YOLO.latency * 1000;
    this.inferences = [];   // completion times, for the cadence strip
    this.count = 0;
  }

  update(t, dt) {
    if (t < this.last - 0.001 || t - this.last > 2) this.reset(t);
    this.last = t;
    if (this.pending && t >= this.pending.done) this.apply(this.pending, t);
    if (!this.pending && t >= this.next) {
      const tc = Math.max(this.next, t - 0.05);
      const lat = clamp(YOLO.latency + gauss(this.rand) * YOLO.latencySd, 0.115, 0.235);
      this.pending = { tc, done: tc + lat, lat, dets: this.infer(tc) };
      this.next = tc + lat + 0.015; // pre/post-processing between inferences -> ~5.5 FPS
    }
    // Smooth display boxes toward the latest inference (a light tracker, as an on-screen overlay would).
    const k = 1 - Math.exp(-dt / 0.06);
    for (const tr of this.tracks.values()) {
      for (const key of ['x', 'y', 'w', 'h']) tr[key] += (tr.target[key] - tr[key]) * k;
      tr.alpha = tr.lost ? clamp(1 - (t - tr.lost) / FADE) : 1;
      if (tr.lost && t - tr.lost > FADE) this.tracks.delete(tr.id);
    }
  }

  infer(tc) {
    const dets = [];
    for (const c of this.candidatesAt(tc)) {
      const conf = clamp(c.conf + gauss(this.rand) * 0.028, 0, 0.97);
      const j = () => gauss(this.rand) * 0.004;
      dets.push({ ...c, conf, x: c.x + j() * c.w * 8, y: c.y + j() * c.h * 4, w: c.w * (1 + j() * 3), h: c.h * (1 + j() * 2) });
    }
    return dets;
  }

  apply(p, t) {
    const seen = new Set();
    for (const d of p.dets) {
      const tr = this.tracks.get(d.id);
      // Hysteresis around the 0.45 threshold used by the semantic localizer keeps boxes from flickering.
      if (d.conf < (tr && !tr.lost ? YOLO.minConf - 0.05 : YOLO.minConf)) continue;
      seen.add(d.id);
      if (tr) { tr.target = d; tr.conf = d.conf; if (tr.lost) { tr.lost = 0; tr.born = t; } }
      else this.tracks.set(d.id, { id: d.id, cls: d.cls, conf: d.conf, target: d, x: d.x, y: d.y, w: d.w, h: d.h, born: t, alpha: 1, lost: 0 });
    }
    for (const tr of this.tracks.values()) if (!seen.has(tr.id) && !tr.lost) tr.lost = t;
    // Rates come from the scheduled completion times, so a slow display never skews them.
    const interval = p.done - (this.inferences.at(-1) ?? p.done - 1 / YOLO.fps);
    if (interval > 0.05) this.fps += (1 / interval - this.fps) * 0.3;
    this.ms += (p.lat * 1000 - this.ms) * 0.3;
    this.inferences.push(p.done);
    while (this.inferences.length > 40) this.inferences.shift();
    this.count++;
    this.pending = null;
    this.lastDets = p.dets.filter((d) => seen.has(d.id));
  }

  list() { return [...this.tracks.values()]; }
}

/* ---------- Real footage ---------- */

const iou = (a, b) => {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const i = ix * iy;
  return i / (a.w * a.h + b.w * b.h - i || 1);
};

/**
 * Detections recorded on a real video. Format:
 * { fps, width, height, frames: [ { t, boxes: [ { cls, conf, x, y, w, h } ] } ] } with normalised coords.
 * Boxes are linked frame to frame (same class, IoU > 0.2) so they can be interpolated and animated.
 */
export class VideoTracks {
  constructor(data) {
    this.width = data.width || 1280;
    this.model = data.model || null;
    this.height = data.height || 720;
    this.fps = data.fps || 30;
    this.frames = (data.frames || []).map((f) => ({ t: +f.t, boxes: (f.boxes || []).map((b) => ({ ...b })) })).sort((a, b) => a.t - b.t);
    this.first = new Map();
    let nextId = 0, prev = [];
    for (const f of this.frames) {
      const pairs = [];
      for (const b of f.boxes) for (const p of prev) if (p.cls === b.cls) { const s = iou(p, b); if (s > 0.2) pairs.push([s, b, p]); }
      pairs.sort((a, b) => b[0] - a[0]);
      const used = new Set();
      for (const [, b, p] of pairs) if (!b.id && !used.has(p.id)) { b.id = p.id; used.add(p.id); }
      for (const b of f.boxes) if (!b.id) { b.id = `v${nextId++}`; this.first.set(b.id, f.t); }
      prev = f.boxes;
    }
    // Typical spacing between detection frames, to decide how long a box may be held.
    const gaps = this.frames.slice(1).map((f, i) => f.t - this.frames[i].t).sort((a, b) => a - b);
    this.gap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 1 / this.fps;
  }

  /** Boxes to draw at video time t. */
  at(t) {
    const F = this.frames;
    if (!F.length || t < F[0].t - 0.05) return [];
    let lo = 0, hi = F.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (F[m].t <= t) lo = m; else hi = m - 1; }
    const A = F[lo], B = F[lo + 1];
    const span = B ? B.t - A.t : Infinity;
    const f = B ? clamp((t - A.t) / span) : 0;
    const hold = Math.max(this.gap * 2.5, 0.25);
    const out = [];
    for (const a of A.boxes) {
      const b = B && span < 1.2 ? B.boxes.find((q) => q.id === a.id) : null;
      const born = this.first.get(a.id) ?? A.t;
      if (b) out.push({ id: a.id, cls: a.cls, conf: a.conf + (b.conf - a.conf) * f, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, w: a.w + (b.w - a.w) * f, h: a.h + (b.h - a.h) * f, born, alpha: 1 });
      else { const age = t - A.t; if (age < hold) out.push({ ...a, born, alpha: clamp(1 - (age - hold * 0.5) / (hold * 0.5)) }); }
    }
    return out;
  }
}

/* ---------- Overlay ---------- */

/** Colour for a class: its design token, or a stable fallback for classes outside the corridor set. */
export function classColor(cls, tk) {
  const name = CLASSES[cls]?.color;
  if (name) return tk[name];
  const pool = [tk.cyan, tk.mint, tk.violet, tk.amber, tk.gold, tk.ember];
  let h = 0; for (const ch of cls) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[h % pool.length];
}

/**
 * Draws boxes (normalised coords) into `rect`. Each new box "locks on": brackets converge from
 * a wider frame, a flash fills the box and the label types itself out.
 */
export function drawDetections(ctx, rect, boxes, now, tk, { font = 11, labels = true, highlight = null, dim = false } = {}) {
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  ctx.font = `500 ${font}px "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace`;
  ctx.textBaseline = 'middle';
  for (const b of boxes) {
    const col = classColor(b.cls, tk);
    const k = easeOut((now - b.born) / LOCK);
    const a = (b.alpha ?? 1) * (dim && highlight !== b.id ? 0.35 : 1);
    if (a <= 0.01) continue;
    const x = rect.x + b.x * rect.w, y = rect.y + b.y * rect.h, w = b.w * rect.w, h = b.h * rect.h;
    const e = 1 + (1 - k) * 0.45, cx = x + w / 2, cy = y + h / 2, W = w * e, H = h * e;
    const X = cx - W / 2, Y = cy - H / 2;
    ctx.globalAlpha = a;
    // Fill: faint tint plus a flash on lock.
    ctx.fillStyle = rgba(col, 0.07 + 0.22 * (1 - k));
    ctx.fillRect(X, Y, W, H);
    // Hairline rectangle once locked, heavier corner brackets always.
    ctx.strokeStyle = rgba(col, 0.75 * k);
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(X) + 0.5, Math.round(Y) + 0.5, Math.round(W), Math.round(H));
    const L = Math.max(5, Math.min(16, Math.min(W, H) * 0.28));
    ctx.strokeStyle = col;
    ctx.lineWidth = highlight === b.id ? 3 : 2;
    ctx.beginPath();
    for (const [px, py, sx, sy] of [[X, Y, 1, 1], [X + W, Y, -1, 1], [X, Y + H, 1, -1], [X + W, Y + H, -1, -1]]) {
      ctx.moveTo(px, py + sy * L); ctx.lineTo(px, py); ctx.lineTo(px + sx * L, py);
    }
    ctx.stroke();
    if (!labels) continue;
    // Label: class + confidence, typed out during the lock-on.
    const full = `${b.cls} ${b.conf.toFixed(2)}`;
    const txt = full.slice(0, Math.max(1, Math.ceil(full.length * clamp(k * 1.6))));
    const tw = ctx.measureText(full).width + 10, th = font + 7;
    let ly = Y - th;
    if (ly < rect.y + 2) ly = Math.max(rect.y + 2, Y + 2); // no room above: tuck the label inside the box
    const lx = clamp(X, rect.x, rect.x + rect.w - tw);
    ctx.fillStyle = col;
    ctx.globalAlpha = a * (0.4 + 0.6 * k);
    ctx.fillRect(lx, ly, tw, th);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#0a0a0b';
    ctx.fillText(txt, lx + 5, ly + th / 2 + 0.5);
  }
  ctx.restore();
}
