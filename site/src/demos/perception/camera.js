// Procedural "robot camera" renderer: a pinhole projection (the C920's real fx and cx) of the shared
// corridor, drawn with Canvas 2D (painter's algorithm, per-strip lighting and depth haze), plus the
// geometric ground truth that the simulated YOLO26n detector turns into boxes.

import { CAM, CEIL, HALF_W, DOORS, LIGHTS, BOARD, BAY, CLASSES, personJoints } from './world.js';
import { clamp, rng } from './common.js';

const NEAR = 0.06;
const FAR = 24;
// The camera sits 9.5 cm above the floor; a slight upward tilt (a presentation choice, not a paper value)
// keeps people's heads in frame. ASF only uses horizontal angles, which the tilt leaves unchanged.
const TILT = 7 * Math.PI / 180;

/* ---------- Colours of the physical scene (a warm, slightly desaturated university corridor) ---------- */
const C = {
  haze: [196, 190, 176], wallHi: [226, 216, 196], wallLo: [124, 138, 126], skirting: [62, 58, 54],
  floor: [126, 118, 106], ceiling: [218, 214, 204], doorway: [30, 28, 26], frame: [178, 166, 146],
  light: [255, 246, 226], cork: [158, 118, 78], paper: [232, 228, 216],
  wood: [146, 108, 72], metal: [52, 54, 58], chair: [58, 76, 98], tableTop: [190, 178, 160], tableLeg: [70, 72, 76],
  pot: [150, 84, 56], leafA: [52, 98, 58], leafB: [76, 128, 70], bottle: [150, 196, 214], cap: [40, 90, 170],
  skin: [190, 146, 118], hair: [36, 30, 28], jacket: [62, 70, 88], trousers: [42, 44, 52], shoe: [24, 24, 26],
};
const rgb = (c, k = 1) => `rgb(${Math.round(clamp(c[0] * k, 0, 255))},${Math.round(clamp(c[1] * k, 0, 255))},${Math.round(clamp(c[2] * k, 0, 255))})`;
const fogged = (c, depth, k = 1) => {
  const f = clamp(1 - Math.exp(-depth / 21), 0, 0.82);
  return [c[0] * k + (C.haze[0] - c[0] * k) * f, c[1] * k + (C.haze[1] - c[1] * k) * f, c[2] * k + (C.haze[2] - c[2] * k) * f];
};

/* ---------- Camera model ---------- */

/** Camera pose and projection for an image rect; pitch adds wheel-vibration shake. */
export function makeCamera(robot, rect, shake = 0) {
  const pitch = TILT + shake;
  const cy0 = Math.cos(robot.yaw), sy0 = Math.sin(robot.yaw);
  const pos = [robot.x + cy0 * CAM.x, robot.y + sy0 * CAM.x, CAM.z];
  const F = CAM.fx * (rect.w / CAM.width), cx = rect.x + CAM.cx * (rect.w / CAM.width), cy = rect.y + rect.h / 2;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const toCam = (p) => {
    const dx = p[0] - pos[0], dy = p[1] - pos[1], dz = p[2] - pos[2];
    const f = dx * cy0 + dy * sy0, l = -dx * sy0 + dy * cy0;
    return [f * cp + dz * sp, l, dz * cp - f * sp];
  };
  const proj = (c) => [cx - (F * c[1]) / c[0], cy - (F * c[2]) / c[0]];
  return { pos, F, cx, cy, rect, toCam, proj, yaw: robot.yaw };
}

/** Clips a camera-space polygon against the near plane (Sutherland-Hodgman, single plane). */
function clipNear(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ina = a[0] >= NEAR, inb = b[0] >= NEAR;
    if (ina) out.push(a);
    if (ina !== inb) {
      const t = (NEAR - a[0]) / (b[0] - a[0]);
      out.push([NEAR, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

function fillPoly(ctx, cam, world, fill) {
  const cpts = clipNear(world.map(cam.toCam));
  if (cpts.length < 3) return false;
  ctx.beginPath();
  cpts.forEach((c, i) => { const [u, v] = cam.proj(c); if (i) ctx.lineTo(u, v); else ctx.moveTo(u, v); });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  return true;
}

function line3(ctx, cam, a, b) {
  let A = cam.toCam(a), B = cam.toCam(b);
  if (A[0] < NEAR && B[0] < NEAR) return;
  if (A[0] < NEAR) { const t = (NEAR - A[0]) / (B[0] - A[0]); A = [NEAR, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]; }
  if (B[0] < NEAR) { const t = (NEAR - B[0]) / (A[0] - B[0]); B = [NEAR, B[1] + (A[1] - B[1]) * t, B[2] + (A[2] - B[2]) * t]; }
  const p = cam.proj(A), q = cam.proj(B);
  ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
}

const depthOf = (cam, p) => cam.toCam(p)[0];

/** Brightness of a wall/floor strip from the ceiling panels above it (1 = under a light). */
function lightAt(x) {
  const lx = ((x % BAY) + BAY) % BAY;
  let best = 0;
  for (const L of LIGHTS) for (const o of [-BAY, 0, BAY]) best = Math.max(best, Math.exp(-(((lx - L - o) / 1.25) ** 2)));
  return 0.8 + 0.28 * best;
}

/* ---------- Architecture ---------- */

function drawArchitecture(ctx, cam, robot) {
  const x0 = Math.floor(robot.x - 1), x1 = robot.x + FAR;
  // Half-metre strips near the camera (smooth lighting), one-metre strips further away; drawn far to near.
  const edges = [];
  for (let x = x0; x < x1; x += x < robot.x + 6 ? 0.5 : 1) edges.push(x);
  for (let i = edges.length - 1; i >= 0; i--) {
    const a = edges[i], b = edges[i + 1] ?? a + 1, mid = (a + b) / 2;
    const d = Math.max(0.1, mid - robot.x), k = lightAt(mid);
    // Floor, ceiling and two-tone walls per one-metre strip.
    fillPoly(ctx, cam, [[a, -HALF_W, 0], [b, -HALF_W, 0], [b, HALF_W, 0], [a, HALF_W, 0]], rgb(fogged(C.floor, d, k * 0.95)));
    fillPoly(ctx, cam, [[a, -HALF_W, CEIL], [b, -HALF_W, CEIL], [b, HALF_W, CEIL], [a, HALF_W, CEIL]], rgb(fogged(C.ceiling, d, k * 0.9)));
    for (const s of [1, -1]) {
      const y = s * HALF_W, shade = s > 0 ? 1 : 0.9;
      fillPoly(ctx, cam, [[a, y, 1.05], [b, y, 1.05], [b, y, CEIL], [a, y, CEIL]], rgb(fogged(C.wallHi, d, k * shade)));
      fillPoly(ctx, cam, [[a, y, 0.1], [b, y, 0.1], [b, y, 1.05], [a, y, 1.05]], rgb(fogged(C.wallLo, d, k * shade)));
      fillPoly(ctx, cam, [[a, y, 0], [b, y, 0], [b, y, 0.1], [a, y, 0.1]], rgb(fogged(C.skirting, d, k)));
    }
  }

  // Floor tiles (terrazzo grid) and the dado rail.
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(40,36,32,0.16)';
  ctx.beginPath();
  for (let x = Math.ceil((robot.x - 1) / 0.6) * 0.6; x < x1; x += 0.6) line3(ctx, cam, [x, -HALF_W, 0], [x, HALF_W, 0]);
  for (let y = -1.2; y <= 1.21; y += 0.6) line3(ctx, cam, [x0, y, 0], [x1, y, 0]);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,250,240,0.12)';
  ctx.beginPath();
  for (const s of [1, -1]) line3(ctx, cam, [x0, s * HALF_W, 1.05], [x1, s * HALF_W, 1.05]);
  ctx.stroke();
  ctx.restore();

  const bays = [];
  for (let b = Math.floor(x0 / BAY); b <= Math.floor(x1 / BAY); b++) bays.push(b * BAY);

  // Doorways, notice boards and ceiling panels, far to near.
  const items = [];
  for (const ox of bays) {
    for (const d of DOORS) items.push({ x: ox + (d.x0 + d.x1) / 2, draw: () => drawDoor(ctx, cam, ox, d, robot) });
    items.push({ x: ox + (BOARD.x0 + BOARD.x1) / 2, draw: () => drawBoard(ctx, cam, ox, robot) });
    for (const L of LIGHTS) items.push({ x: ox + L, draw: () => drawLight(ctx, cam, ox + L, robot) });
  }
  items.filter((i) => i.x > robot.x - 1 && i.x < x1).sort((p, q) => q.x - p.x).forEach((i) => i.draw());
}

/** The 3D outline of a doorway, also used to clip the person while they are inside the room. */
export function doorQuad(ox, d) {
  const y = d.side * HALF_W;
  return [[ox + d.x0, y, 0], [ox + d.x1, y, 0], [ox + d.x1, y, 2.1], [ox + d.x0, y, 2.1]];
}

function drawDoor(ctx, cam, ox, d, robot) {
  const y = d.side * HALF_W, dist = ox + d.x0 - robot.x;
  const fr = 0.07;
  fillPoly(ctx, cam, [[ox + d.x0 - fr, y, 0], [ox + d.x1 + fr, y, 0], [ox + d.x1 + fr, y, 2.1 + fr], [ox + d.x0 - fr, y, 2.1 + fr]], rgb(fogged(C.frame, dist)));
  fillPoly(ctx, cam, doorQuad(ox, d), rgb(fogged(C.doorway, dist)));
  // A little light spill on the room floor through the doorway.
  const yi = d.side * (HALF_W + 0.9);
  fillPoly(ctx, cam, [[ox + d.x0, y, 0.001], [ox + d.x1, y, 0.001], [ox + d.x1 - 0.1, yi, 0.001], [ox + d.x0 + 0.1, yi, 0.001]], rgb(fogged([62, 58, 52], dist)));
}

function drawBoard(ctx, cam, ox, robot) {
  const y = HALF_W - 0.005, dist = ox + BOARD.x0 - robot.x;
  fillPoly(ctx, cam, [[ox + BOARD.x0, y, BOARD.z0], [ox + BOARD.x1, y, BOARD.z0], [ox + BOARD.x1, y, BOARD.z1], [ox + BOARD.x0, y, BOARD.z1]], rgb(fogged(C.cork, dist)));
  const sheets = [[0.12, 1.3, 0.3, 0.38], [0.5, 1.42, 0.24, 0.3], [0.86, 1.25, 0.32, 0.42]];
  for (const [sx, sz, w, h] of sheets) {
    fillPoly(ctx, cam, [[ox + BOARD.x0 + sx, y - 0.003, sz], [ox + BOARD.x0 + sx + w, y - 0.003, sz], [ox + BOARD.x0 + sx + w, y - 0.003, sz + h], [ox + BOARD.x0 + sx, y - 0.003, sz + h]], rgb(fogged(C.paper, dist)));
  }
}

function drawLight(ctx, cam, x, robot) {
  const z = CEIL - 0.01, dist = x - robot.x;
  if (dist < 0.5) return;
  const ok = fillPoly(ctx, cam, [[x - 0.6, -0.16, z], [x + 0.6, -0.16, z], [x + 0.6, 0.16, z], [x - 0.6, 0.16, z]], rgb(fogged(C.light, dist * 0.5)));
  if (!ok) return;
  // Bloom around the panel and its glossy reflection on the terrazzo.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = (p, r, a) => {
    const c = cam.toCam(p); if (c[0] < NEAR) return;
    const [u, v] = cam.proj(c), R = Math.min((r * cam.F) / c[0], cam.rect.w * 0.22); // capped: big gradients are costly
    const g = ctx.createRadialGradient(u, v, 0, u, v, R);
    g.addColorStop(0, `rgba(255,236,200,${a})`); g.addColorStop(1, 'rgba(255,236,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(u, v, R, R * 0.55, 0, 0, Math.PI * 2); ctx.fill();
  };
  const fade = clamp(1 - dist / FAR);
  glow([x, 0, z], 1.1, 0.16 * fade);
  glow([x, 0, -z * 0.92], 1.3, 0.1 * fade);
  ctx.restore();
}

/* ---------- Furniture and people ---------- */

const SHADE = { top: 1.06, bottom: 0.5, nx: 0.8, px: 0.66, y: 0.7 };

function cuboid(x0, x1, y0, y1, z0, z1, color) {
  const v = (x, y, z) => [x, y, z];
  return [
    { p: [v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)], n: [0, 0, 1], k: SHADE.top, color },
    { p: [v(x0, y0, z0), v(x0, y1, z0), v(x1, y1, z0), v(x1, y0, z0)], n: [0, 0, -1], k: SHADE.bottom, color },
    { p: [v(x0, y0, z0), v(x0, y1, z0), v(x0, y1, z1), v(x0, y0, z1)], n: [-1, 0, 0], k: SHADE.nx, color },
    { p: [v(x1, y0, z0), v(x1, y0, z1), v(x1, y1, z1), v(x1, y1, z0)], n: [1, 0, 0], k: SHADE.px, color },
    { p: [v(x0, y0, z0), v(x0, y0, z1), v(x1, y0, z1), v(x1, y0, z0)], n: [0, -1, 0], k: SHADE.y, color },
    { p: [v(x0, y1, z0), v(x1, y1, z0), v(x1, y1, z1), v(x0, y1, z1)], n: [0, 1, 0], k: SHADE.y * 1.05, color },
  ];
}

function drawFaces(ctx, cam, faces) {
  const list = [];
  for (const f of faces) {
    const c = f.p.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4, s[2] + p[2] / 4], [0, 0, 0]);
    const toEye = [cam.pos[0] - c[0], cam.pos[1] - c[1], cam.pos[2] - c[2]];
    if (toEye[0] * f.n[0] + toEye[1] * f.n[1] + toEye[2] * f.n[2] <= 0) continue;
    list.push({ f, d: Math.hypot(...toEye) });
  }
  list.sort((a, b) => b.d - a.d);
  for (const { f, d } of list) fillPoly(ctx, cam, f.p, rgb(fogged(f.color, d, f.k)));
}

function partsFor(o) {
  const hx = o.sx / 2, hy = o.sy / 2;
  if (o.kind === 'table') {
    const legs = [[1, 1], [1, -1], [-1, 1], [-1, -1]].flatMap(([a, b]) => {
      const lx = o.x + a * (hx - 0.05), ly = o.y + b * (hy - 0.05);
      return cuboid(lx - 0.02, lx + 0.02, ly - 0.02, ly + 0.02, 0, o.h - 0.03, C.tableLeg);
    });
    return [...legs, ...cuboid(o.x - hx, o.x + hx, o.y - hy, o.y + hy, o.h - 0.03, o.h, C.tableTop)];
  }
  if (o.kind === 'chair') {
    const legs = [[1, 1], [1, -1], [-1, 1], [-1, -1]].flatMap(([a, b]) => {
      const lx = o.x + a * (hx - 0.04), ly = o.y + b * (hy - 0.04);
      return cuboid(lx - 0.012, lx + 0.012, ly - 0.012, ly + 0.012, 0, 0.44, C.metal);
    });
    // Seat, then a backrest on the wall side (the chair faces into the corridor).
    const by = o.y - hy;
    return [...legs, ...cuboid(o.x - hx, o.x + hx, o.y - hy, o.y + hy, 0.43, 0.47, C.chair),
      ...cuboid(o.x - hx + 0.02, o.x + hx - 0.02, by, by + 0.035, 0.5, o.h, C.chair),
      ...cuboid(o.x - hx + 0.03, o.x - hx + 0.06, by, by + 0.03, 0.47, 0.5, C.metal),
      ...cuboid(o.x + hx - 0.06, o.x + hx - 0.03, by, by + 0.03, 0.47, 0.5, C.metal)];
  }
  if (o.kind === 'bench') {
    const ends = [-1, 1].flatMap((a) => { const x = o.x + a * (hx - 0.1); return cuboid(x - 0.025, x + 0.025, o.y - hy + 0.02, o.y + hy - 0.02, 0, o.h - 0.05, C.metal); });
    const slats = [0, 1, 2].flatMap((i) => { const y0 = o.y - hy + i * (o.sy / 3); return cuboid(o.x - hx, o.x + hx, y0 + 0.01, y0 + o.sy / 3 - 0.01, o.h - 0.05, o.h, C.wood); });
    return [...ends, ...slats];
  }
  return [];
}

const LEAVES = (() => {
  const r = rng(7), out = [];
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2, h = 0.38 + r() * 0.62, spread = 0.07 + (h - 0.38) * 0.42 * (0.6 + r() * 0.5);
    out.push({ dx: Math.cos(a) * spread, dy: Math.sin(a) * spread, z: h, rot: r() * Math.PI, s: 0.055 + r() * 0.05, c: r() < 0.5 ? C.leafA : C.leafB, k: 0.75 + r() * 0.45 });
  }
  return out;
})();

function drawPlant(ctx, cam, o, t) {
  const c = cam.toCam([o.x, o.y, 0.16]);
  if (c[0] < NEAR + 0.05) return;
  const d = c[0];
  // Pot: a tapered cylinder drawn as a shaded trapezoid facing the camera.
  const top = cam.proj(cam.toCam([o.x, o.y, 0.33])), bot = cam.proj(cam.toCam([o.x, o.y, 0]));
  const rt = (o.r * cam.F) / d, rb = (o.r * 0.78 * cam.F) / d;
  const g = ctx.createLinearGradient(top[0] - rt, 0, top[0] + rt, 0);
  g.addColorStop(0, rgb(fogged(C.pot, d, 0.62))); g.addColorStop(0.4, rgb(fogged(C.pot, d, 1.05))); g.addColorStop(1, rgb(fogged(C.pot, d, 0.55)));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(top[0] - rt, top[1]); ctx.lineTo(top[0] + rt, top[1]); ctx.lineTo(bot[0] + rb, bot[1]); ctx.lineTo(bot[0] - rb, bot[1]); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgb(fogged(C.pot, d, 0.82));
  ctx.fillRect(top[0] - rt * 1.05, top[1], rt * 2.1, Math.max(1, (0.03 * cam.F) / d));
  // Foliage: leaf ellipses sorted far to near, swaying a touch.
  const leaves = LEAVES.map((L) => {
    const sway = Math.sin(t * 0.9 + L.rot * 3) * 0.006 * L.z;
    const p = [o.x + L.dx + sway, o.y + L.dy, L.z];
    return { L, cc: cam.toCam(p) };
  }).filter((q) => q.cc[0] > NEAR).sort((a, b) => b.cc[0] - a.cc[0]);
  for (const { L, cc } of leaves) {
    const [u, v] = cam.proj(cc), s = (L.s * cam.F) / cc[0];
    ctx.fillStyle = rgb(fogged(L.c, cc[0], L.k));
    ctx.beginPath(); ctx.ellipse(u, v, s, s * 0.38, L.rot, 0, Math.PI * 2); ctx.fill();
  }
}

function drawBottle(ctx, cam, o) {
  const c = cam.toCam([o.x, o.y, 0.1]);
  if (c[0] < NEAR + 0.05) return;
  const d = c[0], P = (z) => cam.proj(cam.toCam([o.x, o.y, z])), r = (o.r * cam.F) / d;
  const b = P(0), s = P(0.17), n = P(0.205), tp = P(o.h);
  ctx.fillStyle = rgb(fogged(C.bottle, d, 0.85));
  ctx.beginPath();
  ctx.moveTo(b[0] - r, b[1]); ctx.lineTo(s[0] - r, s[1]); ctx.lineTo(n[0] - r * 0.38, n[1]); ctx.lineTo(tp[0] - r * 0.38, tp[1]);
  ctx.lineTo(tp[0] + r * 0.38, tp[1]); ctx.lineTo(n[0] + r * 0.38, n[1]); ctx.lineTo(s[0] + r, s[1]); ctx.lineTo(b[0] + r, b[1]); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(b[0] - r * 0.55, s[1], Math.max(1, r * 0.22), b[1] - s[1]);
  ctx.fillStyle = rgb(fogged(C.cap, d));
  const cpt = P(o.h + 0.012);
  ctx.fillRect(cpt[0] - r * 0.42, cpt[1], r * 0.84, Math.max(1, tp[1] - cpt[1]));
}

function drawPerson(ctx, cam, p, t) {
  const j = personJoints(p, t);
  const pc = cam.toCam(j.pelvis);
  if (pc[0] < NEAR + 0.1) return;
  ctx.save();
  // Inside a room the person is only visible through the doorway opening.
  if (Math.abs(p.y) > HALF_W - 0.02) {
    const ox = Math.floor(p.x / BAY) * BAY;
    const door = DOORS.find((d) => d.side === Math.sign(p.y));
    const q = clipNear(doorQuad(ox, door).map(cam.toCam));
    if (q.length < 3) { ctx.restore(); return; }
    ctx.beginPath(); q.forEach((c, i) => { const [u, v] = cam.proj(c); if (i) ctx.lineTo(u, v); else ctx.moveTo(u, v); }); ctx.closePath(); ctx.clip();
  }
  const dark = Math.abs(p.y) > HALF_W ? 0.35 : 1;
  const P = (w) => { const c = cam.toCam(w); return c[0] > NEAR ? [...cam.proj(c), c[0]] : null; };
  const limb = (a, b, width, col) => {
    const A = P(a), B = P(b); if (!A || !B) return;
    ctx.strokeStyle = rgb(fogged(col, A[2], dark)); ctx.lineWidth = Math.max(1, (width * cam.F) / ((A[2] + B[2]) / 2));
    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
  };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Soft contact shadow.
  const sh = P([p.x, p.y, 0.001]);
  if (sh) { ctx.fillStyle = `rgba(0,0,0,${0.22 * dark})`; ctx.beginPath(); ctx.ellipse(sh[0], sh[1], (0.32 * cam.F) / sh[2], (0.04 * cam.F) / sh[2], 0, 0, Math.PI * 2); ctx.fill(); }
  const far = cam.toCam(j.L.hip)[0] > cam.toCam(j.R.hip)[0] ? ['L', 'R'] : ['R', 'L'];
  const drawLeg = (L) => { limb(L.hip, L.knee, 0.13, C.trousers); limb(L.knee, L.foot, 0.11, C.trousers); limb(L.foot, [L.foot[0], L.foot[1], 0.02], 0.1, C.shoe); };
  const drawArm = (A) => { limb(A.sh, A.el, 0.1, C.jacket); limb(A.el, A.wr, 0.085, C.jacket); limb(A.wr, [A.wr[0], A.wr[1], A.wr[2] - 0.06], 0.07, C.skin); };
  drawArm(far[0] === 'L' ? j.aL : j.aR);
  drawLeg(far[0] === 'L' ? j.L : j.R);
  drawLeg(far[1] === 'L' ? j.L : j.R);
  limb(j.pelvis, j.neck, 0.36, C.jacket);
  drawArm(far[1] === 'L' ? j.aL : j.aR);
  limb(j.neck, [j.neck[0], j.neck[1], j.neck[2] + 0.06], 0.1, C.skin);
  const H = P(j.head);
  if (H) {
    const r = (0.105 * cam.F) / H[2];
    ctx.fillStyle = rgb(fogged(C.skin, H[2], dark)); ctx.beginPath(); ctx.ellipse(H[0], H[1], r * 0.86, r, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgb(fogged(C.hair, H[2], dark)); ctx.beginPath(); ctx.ellipse(H[0], H[1] - r * 0.35, r * 0.9, r * 0.7, 0, Math.PI, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/* ---------- Public: render a frame ---------- */

/**
 * Draws the camera image of `scene` into `rect` of a 2D context.
 * @returns the camera used, so callers can project overlays consistently.
 */
export function renderCamera(ctx, rect, scene, { shake = 0 } = {}) {
  const { robot, objects, person, t } = scene;
  const cam = makeCamera(robot, rect, shake);
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  ctx.fillStyle = rgb(C.haze); ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  // Daylight at the far end of the corridor, slightly over-exposed like a webcam would render it.
  const vp = cam.toCam([robot.x + 200, robot.y, CAM.z]);
  if (vp[0] > 0) {
    const [u, v] = cam.proj(vp), R = rect.w * 0.12;
    const g = ctx.createRadialGradient(u, v, 0, u, v, R);
    g.addColorStop(0, 'rgb(255,252,244)'); g.addColorStop(1, rgb(C.haze));
    ctx.fillStyle = g; ctx.fillRect(u - R, v - R, 2 * R, 2 * R);
  }
  drawArchitecture(ctx, cam, robot);

  const drawables = [];
  for (const o of objects) {
    const d = depthOf(cam, [o.x, o.y, 0.3]);
    if (d < -1 || d > FAR) continue;
    if (o.kind === 'plant') drawables.push({ d, draw: () => drawPlant(ctx, cam, o, t) });
    else if (o.kind === 'bottle') drawables.push({ d, draw: () => drawBottle(ctx, cam, o) });
    else drawables.push({ d, draw: () => drawFaces(ctx, cam, partsFor(o)) });
  }
  if (person) drawables.push({ d: depthOf(cam, [person.x, person.y, 1]), draw: () => drawPerson(ctx, cam, person, t) });
  drawables.sort((a, b) => b.d - a.d).forEach((q) => q.draw());
  ctx.restore();
  return cam;
}

/* ---------- Public: ground truth for the simulated detector ---------- */

const AABB_EDGES = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

/** Projected 2D box (pixels) of the visible part of a 3D axis-aligned box, or null. */
function projectAabb(cam, [x0, x1, y0, y1, z0, z1]) {
  const corners = [];
  for (const z of [z0, z1]) for (const y of [y0, y1]) for (const x of [x0, x1]) corners.push(cam.toCam([x, y, z]));
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, any = false;
  const add = (c) => { const [u, v] = cam.proj(c); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); any = true; };
  for (const [a, b] of AABB_EDGES) {
    const A = corners[a], B = corners[b];
    if (A[0] >= NEAR) add(A);
    if ((A[0] >= NEAR) !== (B[0] >= NEAR)) { const t = (NEAR - A[0]) / (B[0] - A[0]); add([NEAR, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]); }
  }
  return any ? { u0, u1, v0, v1 } : null;
}

function boundsOf(o, scene) {
  if (o.kind === 'plant') return [o.x - 0.24, o.x + 0.24, o.y - 0.24, o.y + 0.24, 0, o.h];
  if (o.kind === 'bottle') return [o.x - o.r, o.x + o.r, o.y - o.r, o.y + o.r, 0, o.h + 0.012];
  if (o.kind === 'person') {
    const j = personJoints(o, scene.t), pts = [j.L.foot, j.R.foot, j.aL.wr, j.aR.wr, j.aL.sh, j.aR.sh, j.head];
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return [Math.min(...xs) - 0.08, Math.max(...xs) + 0.08, Math.min(...ys) - 0.08, Math.max(...ys) + 0.08, 0, j.head[2] + 0.12];
  }
  return [o.x - o.sx / 2, o.x + o.sx / 2, o.y - o.sy / 2, o.y + o.sy / 2, 0, o.h];
}

/**
 * What an ideal detector could see right now: normalised boxes (0..1, top-left origin), a base
 * confidence from size, truncation and occlusion, and the object's depth. Noise is added by the detector.
 */
export function detectCandidates(scene, aspect = 4 / 3) {
  const rect = { x: 0, y: 0, w: 1, h: 1 / aspect };
  const cam = makeCamera(scene.robot, rect);
  const items = scene.objects.map((o) => ({ o, cls: o.cls }));
  if (scene.person) items.push({ o: { ...scene.person, kind: 'person' }, cls: 'person' });
  const out = [];
  for (const { o, cls } of items) {
    const c = cam.toCam([o.x, o.y, 0.4]);
    if (c[0] < 0.35 || c[0] > 10.5) continue;
    const b = projectAabb(cam, boundsOf(o, scene));
    if (!b) continue;
    const full = (b.u1 - b.u0) * (b.v1 - b.v0);
    const u0 = clamp(b.u0, 0, rect.w), u1 = clamp(b.u1, 0, rect.w), v0 = clamp(b.v0, 0, rect.h), v1 = clamp(b.v1, 0, rect.h);
    const vis = full > 0 ? ((u1 - u0) * (v1 - v0)) / full : 0;
    if (vis < 0.3 || u1 - u0 < 0.012) continue;
    const hPx = (v1 - v0) * CAM.width; // box height in 640-px image units
    let conf = CLASSES[cls].conf * (0.55 + 0.45 * clamp((hPx - 8) / 70)) * (0.62 + 0.38 * vis);
    if (cls === 'person' && Math.abs(o.y) > HALF_W) conf *= 0.75; // half in the dark doorway
    out.push({ id: o.id, cls, x: u0, y: v0 * aspect, w: u1 - u0, h: (v1 - v0) * aspect, depth: c[0], conf });
  }
  // Occlusion: a nearer box covering most of a farther one suppresses it.
  out.sort((a, b) => a.depth - b.depth);
  for (let i = 0; i < out.length; i++) {
    for (let k = 0; k < i; k++) {
      const A = out[i], B = out[k];
      const ix = Math.max(0, Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x)), iy = Math.max(0, Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y));
      const cover = (ix * iy) / (A.w * A.h);
      if (cover > 0.3) A.conf *= 1 - cover * 0.6;
    }
  }
  return out.filter((o) => o.conf > 0.3);
}

