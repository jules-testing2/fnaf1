// Data behind the ekf-covariance demo.
//
// PAPER holds numbers reported in Abaza, "AI-Driven Dynamic Covariance for ROS 2 Mobile Robot Localization",
// Sensors 2025, 25, 3026 (Tables 3 and §3.5, §4). Nothing else in the demo is a measured value.
//
// buildRegime() synthesises an ILLUSTRATIVE motion and error signal for each motion regime. The commanded
// angular velocities follow the paper's regime definitions (Static |ω| ≤ 0.01 rad/s, Moderate up to 0.7 rad/s,
// Aggressive > 0.5 rad/s with peaks of ±0.667 rad/s as in the logs); the error shapes only mimic the
// qualitative findings (AI covariance tracks calm motion well, sharp turns are the hard case).

/** Deterministic PRNG so every visit shows the same illustrative signal. */
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const PAPER = {
  model: { mae: '0.0061', r2: '0.989', samples: '16,000 → 21,000+', features: 15 },
  // |error_yaw − yaw_diff| for the AI-enabled run (rad)
  ai: {
    static: { median: 0.0362, mean: 0.0543, iqr: 0.0489 },
    moderate: { median: 0.0381, mean: 0.0710, iqr: 0.1069 },
    aggressive: { mean: 0.2257, std: 0.2600, max: 0.9491, iqr: 0.2695 },
  },
  // yaw_diff for the AI-disabled (static covariance) run (rad)
  fixed: {
    static: { iqr: 0.0222 },
    moderate: { iqr: 0.1399, std: 0.1070 },
    aggressive: null, // no samples above the regime threshold in the AI-disabled log
    maxAbs: 0.5771,
  },
};

export const REGIMES = {
  static: { label: 'Static', cmd: '|ω| ≤ 0.01 rad/s' },
  moderate: { label: 'Moderate', cmd: '0.01 < |ω| ≤ 0.7 rad/s' },
  aggressive: { label: 'Aggressive', cmd: '|ω| > 0.5 rad/s (peaks ±0.667)' },
};

export const HZ = 30;

/** Command schedules: list of [duration s, v m/s, ω rad/s]; each is a closed loop. */
const SCHEDULES = {
  static: { start: [-1.1, -0.2, 0], segs: [[7, 0.32, 0], [1.6, 0, 0], [7, -0.32, 0], [1.6, 0, 0]] },
  moderate: {
    start: [-1.12, -1.37, 0],
    segs: [[5.6, 0.4, 0], [3.49, 0.4, 0.45], [2.4, 0.4, 0], [3.49, 0.4, 0.45], [5.6, 0.4, 0], [3.49, 0.4, 0.45], [2.4, 0.4, 0], [3.49, 0.4, 0.45]],
  },
  aggressive: { start: [0, 0, 0.35], segs: [[2 * Math.PI / 0.667, 0.55, 0.667], [2 * Math.PI / 0.667, 0.55, -0.667]] },
};

/** Smooth deterministic noise in roughly [-1, 1]. */
function smoothNoise(rand, n = 4) {
  const parts = Array.from({ length: n }, (_, i) => ({ f: 0.35 + rand() * 1.6 * (i + 1), p: rand() * Math.PI * 2, a: 1 / (i + 1) }));
  const norm = parts.reduce((s, q) => s + q.a, 0);
  return (t) => parts.reduce((s, q) => s + q.a * Math.sin(q.f * t + q.p), 0) / norm;
}

/**
 * Precomputes one loop of a regime at HZ samples per second.
 * Each sample: ground truth pose (x, y, th), commands (v, w), sensor streams (odom v, IMU gyro_z),
 * odometry dead reckoning (ox, oy), and per covariance mode the EKF estimate error (ex, ey),
 * the covariance the filter uses (sx, sy in m, syaw in rad) and an illustrative |yaw error| signal.
 */
export function buildRegime(name) {
  const sch = SCHEDULES[name];
  const rand = rng(name.length * 977 + 13);
  const nA = smoothNoise(rand), nB = smoothNoise(rand), nC = smoothNoise(rand, 6), nD = smoothNoise(rand, 5);
  const jitter = () => rand() * 2 - 1;
  const total = sch.segs.reduce((s, q) => s + q[0], 0);
  const N = Math.round(total * HZ);
  const dt = 1 / HZ;
  let [x, y, th] = sch.start;
  let ox = x, oy = y, oth = th;
  const flips = [];
  let tAcc = 0, lastW = sch.segs[sch.segs.length - 1][2];
  for (const [d, , w] of sch.segs) { if (Math.abs(w - lastW) > 0.5) flips.push(tAcc); lastW = w; tAcc += d; }
  const samples = [];
  const marks = [];
  let nextMark = 0;
  for (let i = 0; i < N; i++) {
    const t = i * dt;
    let acc = 0, seg = sch.segs[0];
    for (const s of sch.segs) { if (t < acc + s[0]) { seg = s; break; } acc += s[0]; }
    const [, v, w] = seg;
    if (t >= nextMark - 1e-9) { marks.push([x, y]); nextMark = acc + seg[0]; }
    // Sharp-turn stress: a bump after each reversal of the turn direction (the regime's hardest moments).
    let jerk = 0;
    for (const f of flips) { const u = (t - f + total) % total; jerk = Math.max(jerk, Math.exp(-((u - 0.5) ** 2) / 0.35)); }
    const turn = Math.abs(w) / 0.667;
    // Odometry: wheel slip grows with turning, so dead reckoning drifts away from the truth.
    oth += (w * (1 + 0.06 * turn) + 0.004 * nD(t)) * dt;
    ox += Math.cos(oth) * v * (1 + 0.015 * turn) * dt;
    oy += Math.sin(oth) * v * (1 + 0.015 * turn) * dt;

    const calm = name === 'static' ? 1 : name === 'moderate' ? 0.6 : 0.3;
    // AI covariance: Random Forest predicted errors, squared into the EKF covariance. It follows turning well,
    // but under-predicts the sharp reversals it rarely saw in training.
    const aiS = 0.03 + 0.07 * turn + 0.05 * jerk;
    const aiErr = 0.022 + 0.06 * turn * Math.abs(nA(t)) + (name === 'aggressive' ? 0.3 * jerk : 0);
    // Fixed covariance: the same matrix whatever the motion; too wide when calm, too narrow in sharp turns.
    const fxS = 0.09;
    const fxErr = 0.02 + 0.11 * turn * Math.abs(nB(t)) + (name === 'aggressive' ? 0.34 * jerk : 0);
    const dir = nC(t * 0.7) * Math.PI;
    // Illustrative |yaw error| traces (rad) shaped after the paper's regime statistics.
    const yawAI = name === 'aggressive'
      ? 0.1 + 0.16 * Math.abs(nC(t)) + 0.8 * jerk * (0.75 + 0.25 * Math.abs(nA(t * 3)))
      : 0.022 + 0.05 * Math.abs(nC(t * 1.3)) * (1 + 0.6 * turn) + 0.004 * Math.abs(jitter());
    const yawFx = name === 'aggressive'
      ? 0.12 + 0.18 * Math.abs(nD(t)) + 0.5 * jerk
      : name === 'static' ? 0.01 + 0.025 * Math.abs(nD(t * 1.4)) + 0.003 * Math.abs(jitter())
        : 0.02 + 0.13 * Math.abs(nD(t * 1.1)) * (0.6 + turn);
    samples.push({
      t, x, y, th, v, w, turn, jerk, calm,
      odomV: v + 0.01 * jitter(), gyro: w + 0.02 * jitter() + 0.04 * jerk * jitter(),
      ox, oy,
      ai: { ex: Math.cos(dir) * aiErr, ey: Math.sin(dir) * aiErr, sx: aiS * (1 - 0.2 * turn), sy: aiS * (1 + 0.5 * turn), syaw: 0.03 + 0.12 * turn + 0.1 * jerk, yaw: yawAI },
      fixed: { ex: Math.cos(dir + 1) * fxErr, ey: Math.sin(dir + 1) * fxErr, sx: fxS, sy: fxS, syaw: 0.1, yaw: yawFx },
    });
    th += w * dt;
    x += Math.cos(th) * v * dt;
    y += Math.sin(th) * v * dt;
  }
  // Waypoints 1–4 echo the paper's real-world test (Nav2 navigation between points 1, 2, 3, 4).
  const waypoints = name === 'moderate' ? [0, 2, 4, 6].map((i) => marks[i]) : name === 'static' ? [marks[0], marks[1]] : [];
  return { name, total, samples, waypoints };
}
