// One procedural indoor scene shared by every perception demo, so the camera feed, the LiDAR
// top-down and the montage all show the SAME corridor, objects and person at the same instant.
//
// Frames follow ROS REP-103: x forward along the corridor, y to the left, z up, metres, radians.
// Sensor numbers are the Xplorer values reported in Sensors 2026, 26, 2232 (Tables 1, 3 and 4)
// and in the paper's code (semantic_map_manager.py, semantic_localizer_node.py).

import { DEG, clamp, lerp, smooth } from './common.js';

/* ---------- Sensors and pipeline constants (paper values) ---------- */

/** Logitech C920 configured at 640x480. Mounted 0.228 m ahead of base_link, 0.095 m up. */
export const CAM = { fx: 687.54, cx: 308.11, width: 640, height: 480, hfov: 49.8 * DEG, x: 0.228, z: 0.095, rate: 30 };
/** STL-19P / LD19: 360 deg, ~503 rays (0.716 deg), 10 Hz, 0.02-25 m, scan plane ~16 cm above the floor. */
export const LIDAR = { rays: 503, angleMin: -Math.PI, inc: (2 * Math.PI) / 503, rate: 10, rangeMin: 0.02, rangeMax: 25, x: 0.222, z: 0.16 };
/** YOLO26n via NCNN on the Raspberry Pi 5 CPU: 5.5 +/- 0.7 FPS, 167 +/- 21 ms per inference, 416x416 input. */
export const YOLO = { fps: 5.5, fpsSd: 0.7, latency: 0.167, latencySd: 0.021, input: 416, minConf: 0.45 };
/** Angular Sector Fusion: 3 Hz, >= 2 valid rays, median window W = 5, stable after 3 detections, 5 s tracking timeout. */
export const FUSION = { rate: 3, minRays: 2, percentile: 25, window: 5, stableAfter: 3, timeout: 5, matchDist: 0.5, alpha: 0.7 };

/** Mobility classes (Table 4): base penalty, speed limit (% of max velocity), TTL in seconds. */
export const MOBILITY = {
  dynamic: { penalty: 50, speed: 30, ttl: 60, update: 'overwrite' },
  static: { penalty: 15, speed: 60, ttl: Infinity, update: 'EMA α = 0.7' },
  minor: { penalty: 5, speed: 90, ttl: 120, update: 'EMA α = 0.7' },
};

/** COCO classes present in the corridor. Colour names refer to design tokens. */
export const CLASSES = {
  person: { mobility: 'dynamic', color: 'orange', conf: 0.91 },
  chair: { mobility: 'static', color: 'cyan', conf: 0.84 },
  'potted plant': { mobility: 'static', color: 'mint', conf: 0.78 },
  bench: { mobility: 'static', color: 'violet', conf: 0.7 },
  'dining table': { mobility: 'static', color: 'gold', conf: 0.63 },
  bottle: { mobility: 'minor', color: 'amber', conf: 0.6 },
};

/* ---------- Corridor layout (one 9 m bay, repeated forever so the drive loops seamlessly) ---------- */

export const BAY = 9;           // metres per repeating bay
export const HALF_W = 1.5;      // corridor half-width
export const CEIL = 2.7;        // ceiling height
export const LOOP = 32;         // seconds per bay (one loop of the run)
export const ROBOT_Y = -0.3;    // the robot keeps to the right of the corridor

/** Doorways cut into the walls: side +1 = left wall (y = +HALF_W), -1 = right wall. */
export const DOORS = [
  { side: 1, x0: 2.9, x1: 3.85 },
  { side: -1, x0: 7.55, x1: 8.5 },
];
export const LIGHTS = [1.5, 4.5, 7.5];
export const BOARD = { x0: 0.35, x1: 1.65, z0: 1.15, z1: 1.85 }; // notice board, left wall (above the scan plane)

/** Furniture and clutter in one bay. Footprints double as LiDAR obstacles at the 16 cm scan plane. */
export const LAYOUT = [
  { id: 'table', cls: 'dining table', kind: 'table', x: 0.95, y: -1.13, sx: 0.9, sy: 0.6, h: 0.74 },
  { id: 'bottle', cls: 'bottle', kind: 'bottle', x: 2.25, y: 0.98, r: 0.035, h: 0.24 },
  { id: 'plant', cls: 'potted plant', kind: 'plant', x: 4.7, y: -1.18, r: 0.17, h: 1.05 },
  { id: 'bench', cls: 'bench', kind: 'bench', x: 6.25, y: 1.28, sx: 1.5, sy: 0.4, h: 0.45 },
  { id: 'chair', cls: 'chair', kind: 'chair', x: 6.45, y: -1.12, sx: 0.46, sy: 0.46, h: 0.88 },
];

/** Person walk in bay-local coordinates: out of the right doorway, down the corridor, into the left doorway. */
const PERSON_PATH = [[8.02, -2.1], [8.02, -1.3], [7.5, -0.45], [4.25, 0.58], [3.42, 1.2], [3.38, 2.1]];
const PERSON_SPEED = 0.9;
const PERSON_START = 4.5; // seconds into the loop
const pathLen = PERSON_PATH.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - PERSON_PATH[i][0], p[1] - PERSON_PATH[i][1]), 0);
export const PERSON_WINDOW = [PERSON_START, PERSON_START + pathLen / PERSON_SPEED];

/* ---------- Robot trajectory: AdjustSpeedLimit slows it to 30 % while the person is near ---------- */

const N_TRAJ = 600;
const traj = (() => {
  const [a, b] = PERSON_WINDOW;
  const speed = (u) => {
    const inWin = smooth((u - (a + 0.6)) / 1.2) * (1 - smooth((u - (b - 0.8)) / 1.4));
    return 1 - 0.7 * inWin; // 100 % -> 30 % (dynamic object speed limit)
  };
  const cum = new Float32Array(N_TRAJ + 1);
  for (let i = 1; i <= N_TRAJ; i++) cum[i] = cum[i - 1] + speed(((i - 0.5) / N_TRAJ) * LOOP);
  const total = cum[N_TRAJ];
  return { cum: cum.map((c) => (c / total) * BAY), speed, vmax: (BAY / LOOP) * (N_TRAJ / total) };
})();

/** Robot pose (base_link in map frame) at demo time t. */
export function robotAt(t) {
  const k = Math.floor(t / LOOP), u = t - k * LOOP;
  const f = (u / LOOP) * N_TRAJ, i = Math.min(N_TRAJ - 1, Math.floor(f));
  const s = lerp(traj.cum[i], traj.cum[i + 1], f - i);
  const ph = (u / LOOP) * 2 * Math.PI;
  // Gentle MPPI-like weave; periodic in the loop so the run repeats seamlessly.
  const yaw = 0.012 * Math.sin(3 * ph) + 0.007 * Math.sin(7 * ph + 1);
  const y = ROBOT_Y + 0.03 * Math.sin(2 * ph);
  const v = traj.vmax * traj.speed(u);
  return { x: k * BAY + s, y, yaw, v, speedPct: Math.round(traj.speed(u) * 100), loop: k, u };
}

/** Person state at demo time t (null while inside a room). */
export function personAt(t) {
  const k = Math.floor(t / LOOP), u = t - k * LOOP;
  const [a, b] = PERSON_WINDOW;
  if (u < a || u > b) return null;
  let d = (u - a) * PERSON_SPEED;
  for (let i = 1; i < PERSON_PATH.length; i++) {
    const p = PERSON_PATH[i - 1], q = PERSON_PATH[i];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d <= L || i === PERSON_PATH.length - 1) {
      const f = clamp(d / L);
      return { x: k * BAY + lerp(p[0], q[0], f), y: lerp(p[1], q[1], f), heading: Math.atan2(q[1] - p[1], q[0] - p[0]), phase: (u - a) * 2 * Math.PI * 0.95, walking: true, id: `${k}:person` };
    }
    d -= L;
  }
  return null;
}

/** Furniture instances in bays overlapping [x0, x1] (world x). */
export function objectsBetween(x0, x1) {
  const out = [];
  for (let b = Math.floor(x0 / BAY) - 1; b <= Math.floor(x1 / BAY) + 1; b++) {
    for (const o of LAYOUT) {
      const x = b * BAY + o.x;
      if (x < x0 - 1.5 || x > x1 + 1.5) continue;
      out.push({ ...o, x, id: `${b}:${o.id}`, bay: b });
    }
  }
  return out;
}

/** Everything a sensor can see at time t. `override.person` pins the person (e.g. standing still for ASF). */
export function sceneAt(t, override = {}) {
  const robot = override.robot || robotAt(t);
  const person = 'person' in override ? override.person : personAt(t);
  const objects = objectsBetween(robot.x - 6, robot.x + 26);
  return { t, robot, person, objects };
}

/* ---------- Person skeleton (shared by the camera renderer and the LiDAR leg model) ---------- */

/** Joint positions in world coordinates for the walking person. */
export function personJoints(p, t = 0) {
  const ch = Math.cos(p.heading), sh = Math.sin(p.heading);
  const fwd = (d) => [ch * d, sh * d], side = (d) => [-sh * d, ch * d];
  const sw = p.walking ? Math.sin(p.phase) : 0.08 * Math.sin(t * 1.3);
  const bob = p.walking ? Math.abs(Math.cos(p.phase)) * 0.025 : 0;
  const at = (f, s, z) => { const a = fwd(f), b = side(s); return [p.x + a[0] + b[0], p.y + a[1] + b[1], z]; };
  const hipZ = 0.92 + bob, shZ = 1.45 + bob;
  const leg = (sgn) => {
    const ph = sgn * sw;
    const foot = at(0.3 * ph, sgn * 0.1, Math.max(0, -ph) * 0.07 + 0.04);
    const knee = at(0.17 * ph + 0.04, sgn * 0.1, 0.5 + bob * 0.5);
    return { hip: at(0, sgn * 0.1, hipZ), knee, foot };
  };
  const arm = (sgn) => {
    const ph = -sgn * sw;
    return { sh: at(0, sgn * 0.2, shZ), el: at(0.13 * ph, sgn * 0.23, 1.17 + bob), wr: at(0.24 * ph + 0.04, sgn * 0.23, 0.9 + bob) };
  };
  return { L: leg(1), R: leg(-1), aL: arm(1), aR: arm(-1), pelvis: at(0, 0, hipZ), neck: at(0.01, 0, shZ + 0.05), head: at(0.02, 0, 1.64 + bob) };
}

/* ---------- 2D LiDAR: ray casting at the scan plane ---------- */

function lidarObstacles(scene) {
  const { robot, objects, person } = scene;
  const segs = [], circles = [];
  const add = (x0, y0, x1, y1, id) => segs.push([x0, y0, x1, y1, id]);
  const b0 = Math.floor((robot.x - 30) / BAY), b1 = Math.floor((robot.x + 30) / BAY);
  for (let b = b0; b <= b1; b++) {
    const ox = b * BAY;
    for (const side of [1, -1]) {
      const y = side * HALF_W;
      const doors = DOORS.filter((d) => d.side === side).sort((a, c) => a.x0 - c.x0);
      let x = ox;
      for (const d of doors) {
        add(x, y, ox + d.x0, y, 'wall');
        // Room behind the doorway: 4 m wide, 3 m deep.
        const cx = ox + (d.x0 + d.x1) / 2, yb = side * (HALF_W + 3);
        add(cx - 2, y, cx - 2, yb, 'room'); add(cx - 2, yb, cx + 2, yb, 'room'); add(cx + 2, yb, cx + 2, y, 'room');
        x = ox + d.x1;
      }
      add(x, y, ox + BAY, y, 'wall');
    }
  }
  for (const o of objects) {
    if (o.kind === 'plant') circles.push([o.x, o.y, 0.16, o.id]);
    else if (o.kind === 'bottle') circles.push([o.x, o.y, o.r, o.id]);
    else if (o.kind === 'table' || o.kind === 'chair') {
      const r = o.kind === 'table' ? 0.025 : 0.014, ix = o.sx / 2 - 0.04, iy = o.sy / 2 - 0.04;
      for (const [a, c] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) circles.push([o.x + a * ix, o.y + c * iy, r, o.id]);
    } else if (o.kind === 'bench') {
      // Two solid end frames reach the scan plane; the seat is above it.
      for (const a of [-1, 1]) { const x = o.x + a * (o.sx / 2 - 0.1); add(x - 0.02, o.y - o.sy / 2, x - 0.02, o.y + o.sy / 2, o.id); add(x + 0.02, o.y - o.sy / 2, x + 0.02, o.y + o.sy / 2, o.id); }
    }
  }
  if (person) {
    const j = personJoints(person, scene.t);
    for (const leg of [j.L, j.R]) {
      const f = 0.24; // scan plane crosses the shin
      circles.push([lerp(leg.foot[0], leg.knee[0], f), lerp(leg.foot[1], leg.knee[1], f), 0.065, person.id]);
    }
  }
  return { segs, circles };
}

/**
 * Simulates one /scan message from the LiDAR mounted on the robot.
 * Returns Float32Array ranges (Infinity = no return), hit ids, and the sensor pose in the map frame.
 */
export function scanAt(scene, rand) {
  const { robot } = scene;
  const pose = { x: robot.x + Math.cos(robot.yaw) * LIDAR.x, y: robot.y + Math.sin(robot.yaw) * LIDAR.x, yaw: robot.yaw };
  const { segs, circles } = lidarObstacles(scene);
  const ranges = new Float32Array(LIDAR.rays), hits = new Array(LIDAR.rays);
  for (let i = 0; i < LIDAR.rays; i++) {
    const a = pose.yaw + LIDAR.angleMin + i * LIDAR.inc, dx = Math.cos(a), dy = Math.sin(a);
    let best = Infinity, id = null;
    for (const [x0, y0, x1, y1, sid] of segs) {
      const ex = x1 - x0, ey = y1 - y0, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const wx = x0 - pose.x, wy = y0 - pose.y;
      const tt = (wx * ey - wy * ex) / den, u = (wx * dy - wy * dx) / den;
      if (tt > 0 && u >= 0 && u <= 1 && tt < best) { best = tt; id = sid; }
    }
    for (const [cx, cy, r, cid] of circles) {
      const ox = pose.x - cx, oy = pose.y - cy, b = ox * dx + oy * dy, c = ox * ox + oy * oy - r * r, disc = b * b - c;
      if (disc < 0) continue;
      const tt = -b - Math.sqrt(disc);
      if (tt > 0 && tt < best) { best = tt; id = cid; }
    }
    if (best > LIDAR.rangeMax || best < LIDAR.rangeMin) { ranges[i] = Infinity; hits[i] = null; continue; }
    // LD19-class range noise (about +/- 1 cm) plus a rare dropout.
    const noise = rand ? (rand() + rand() + rand() - 1.5) * 0.012 : 0;
    ranges[i] = rand && rand() < 0.012 ? Infinity : best + noise;
    hits[i] = id;
  }
  return { ranges, hits, pose };
}

/* ---------- Angular Sector Fusion (Section 3.2.2) ---------- */

export function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * (p / 100), i = Math.floor(pos), f = pos - i;
  return i + 1 < sorted.length ? lerp(sorted[i], sorted[i + 1], f) : sorted[i];
}

/**
 * Localises one YOLO box: pixel columns -> camera angles -> LiDAR sector -> 25th percentile range ->
 * Cartesian point in base_laser -> map frame. Box x coordinates are normalised (0..1) of the 640 px image.
 */
export function asfLocalize(box, scan) {
  const xmin = box.x * CAM.width, xmax = (box.x + box.w) * CAM.width;
  const thLeft = Math.atan2(xmin - CAM.cx, CAM.fx), thRight = Math.atan2(xmax - CAM.cx, CAM.fx);
  const lmin = -thRight, lmax = -thLeft; // sign inversion, theta_offset = 0
  const i0 = Math.ceil((lmin - LIDAR.angleMin) / LIDAR.inc), i1 = Math.floor((lmax - LIDAR.angleMin) / LIDAR.inc);
  const idx = [], valid = [];
  for (let i = i0; i <= i1; i++) {
    const k = ((i % LIDAR.rays) + LIDAR.rays) % LIDAR.rays;
    idx.push(k);
    const r = scan.ranges[k];
    if (Number.isFinite(r) && r >= LIDAR.rangeMin && r <= LIDAR.rangeMax) valid.push(r);
  }
  const sorted = [...valid].sort((a, b) => a - b);
  const base = { xmin, xmax, thLeft, thRight, lmin, lmax, idx, sorted, center: (lmin + lmax) / 2 };
  if (sorted.length < FUSION.minRays) return { ...base, ok: false };
  const d = percentile(sorted, FUSION.percentile);
  const xl = d * Math.cos(base.center), yl = d * Math.sin(base.center);
  const { pose } = scan;
  const mx = pose.x + Math.cos(pose.yaw) * xl - Math.sin(pose.yaw) * yl;
  const my = pose.y + Math.sin(pose.yaw) * xl + Math.cos(pose.yaw) * yl;
  return { ...base, ok: true, d, median: percentile(sorted, 50), mean: sorted.reduce((s, v) => s + v, 0) / sorted.length, xl, yl, mx, my };
}

/* ---------- Temporal tracking + persistent semantic map (Sections 3.2.2 step 6 and 3.3) ---------- */

/**
 * Tracks ASF points (median of the last W = 5, stable after 3 detections, 5 s timeout) and persists
 * stable objects with the mobility rules of Table 4 (dynamic overwrite, EMA alpha 0.7 otherwise, TTL cleanup).
 */
export class SemanticMap {
  constructor() { this.tracks = []; this.objects = []; this.writes = 0; }

  observe(t, cls, x, y, conf) {
    let tr = this.tracks.find((k) => k.cls === cls && Math.hypot(k.x - x, k.y - y) < FUSION.matchDist);
    if (!tr) { tr = { cls, buf: [], n: 0, x, y }; this.tracks.push(tr); }
    tr.buf.push([x, y]); if (tr.buf.length > FUSION.window) tr.buf.shift();
    const med = (i) => { const v = tr.buf.map((p) => p[i]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
    tr.x = med(0); tr.y = med(1); tr.n++; tr.last = t;
    if (tr.n >= FUSION.stableAfter) return this.persist(t, cls, tr.x, tr.y, conf);
    return null;
  }

  persist(t, cls, x, y, conf) {
    const mobility = CLASSES[cls]?.mobility || 'static';
    let o = this.objects.find((k) => k.cls === cls && Math.hypot(k.x - x, k.y - y) < FUSION.matchDist);
    const isNew = !o;
    if (isNew) { o = { cls, mobility, x, y, conf, count: 0, born: t }; this.objects.push(o); }
    else if (mobility === 'dynamic') { o.x = x; o.y = y; }
    else { o.x = FUSION.alpha * o.x + (1 - FUSION.alpha) * x; o.y = FUSION.alpha * o.y + (1 - FUSION.alpha) * y; }
    o.conf = Math.max(o.conf, conf); o.count++; o.last = t;
    return isNew ? o : null;
  }

  cleanup(t) {
    this.tracks = this.tracks.filter((k) => t - k.last < FUSION.timeout);
    this.objects = this.objects.filter((o) => t - o.last < MOBILITY[o.mobility].ttl);
  }
}
