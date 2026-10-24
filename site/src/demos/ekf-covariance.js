// ekf-covariance: what "AI-driven dynamic covariance" changes in an EKF (Sensors 2025, 25, 3026).
// Wheel odometry and the IMU feed robot_localization's EKF; the covariance it trusts is either a fixed
// matrix from YAML or the square of the errors a Random Forest predicts in real time (ai_covariance_node).
// The map shows ground truth, drifting odometry, the EKF estimate and its 2σ ellipses; the side panel
// shows the sensor streams, an illustrative yaw-error trace and the paper's measured numbers.
//
// Options: bare, compact, theme ('dark' | 'paper'), height, aspect, mode ('ai' | 'fixed'), regime.
// Returned API: play(), pause(), destroy(), setMode(m), setRegime(r).

import { createShell, createCanvas, createLoop, legendItem, segmented, el, withAlpha, clamp, lerp } from './navigation/shell.js';
import { PAPER, REGIMES, HZ, buildRegime } from './navigation/ekf-model.js';

const ROOM = { x0: -2.9, x1: 2.9, y0: -2.05, y1: 2.05 };
const MONO = '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace';
const CYCLE = [['static', 'fixed'], ['static', 'ai'], ['moderate', 'fixed'], ['moderate', 'ai'], ['aggressive', 'fixed'], ['aggressive', 'ai']];
const CYCLE_SECONDS = 8;
const fmt = (v) => v.toFixed(4);

export default function mount(host, { options = {}, reducedMotion = false } = {}) {
  const shell = createShell(host, {
    title: options.title || 'robot_localization EKF · fixed vs AI covariance',
    label: 'Top-down view of a robot localisation run: ground truth path, drifting wheel odometry and the EKF estimate with its two-sigma '
      + 'uncertainty ellipses. With fixed covariance the ellipses never change; with AI covariance a Random Forest resizes them as the '
      + 'robot turns. Readouts give the paper\'s measured yaw errors for static, moderate and aggressive motion.',
    options,
    aspect: (w) => (w >= 760 ? (options.compact ? 2.1 : 1.85) : 0),
  });
  const { stage, palette: P, compact, bare } = shell;
  stage.removeAttribute('role'); // the stage holds real text readouts; the map canvas carries the image role
  stage.removeAttribute('aria-label');

  let regime = REGIMES[options.regime] ? options.regime : 'moderate';
  let mode = options.mode === 'fixed' ? 'fixed' : 'ai';
  let auto = !options.regime && !options.mode;
  let cycleT = 0, cycleI = 3;
  if (auto) { regime = CYCLE[cycleI][0]; mode = CYCLE[cycleI][1]; }
  const data = { static: buildRegime('static'), moderate: buildRegime('moderate'), aggressive: buildRegime('aggressive') };

  // ---------- Chrome: legend + controls ----------
  let segMode, segRegime;
  if (shell.legend) {
    shell.legend.append(
      legendItem(P.truth, 'ground truth', 'line'),
      legendItem(P.cyan, 'wheel odometry', 'line'),
      legendItem(P.orange, 'EKF estimate', 'line'),
      legendItem(P.orange, '2σ covariance', 'ring'),
    );
  }
  if (shell.controls) {
    segMode = segmented('Covariance source', [{ value: 'fixed', label: 'Fixed' }, { value: 'ai', label: 'AI · RF' }], mode, (v) => { auto = false; setMode(v); });
    segRegime = segmented('Motion regime', ['static', 'moderate', 'aggressive'].map((r) => ({ value: r, label: REGIMES[r].label })), regime, (v) => { auto = false; setRegime(v); });
    shell.controls.append(segMode.node, segRegime.node);
  }

  // ---------- Layout ----------
  const grid = el('div', 'ekf__grid');
  const mapEl = el('div', 'ekf__map');
  mapEl.setAttribute('role', 'img');
  mapEl.setAttribute('aria-label', 'Localisation map: ground truth, wheel odometry and EKF estimate with covariance ellipses (illustrative motion).');
  const badge = el('div', 'ekf__badge');
  const flag = el('div', 'ekf__flag', 'Truth outside 2σ');
  const illus = el('div', 'ekf__illus', 'Illustrative motion');
  const side = el('div', 'ekf__side');
  const pipe = el('div', 'ekf__pipe');
  const streamsEl = el('div', 'ekf__streams');
  streamsEl.setAttribute('aria-hidden', 'true');
  const chartEl = el('div', 'ekf__chart');
  chartEl.setAttribute('role', 'img');
  chartEl.setAttribute('aria-label', 'Rolling yaw error trace, illustrative, with the paper\'s reference values.');
  const read = el('div', 'ekf__read');
  read.setAttribute('aria-live', 'polite');
  side.append(pipe, streamsEl, chartEl, read);
  grid.append(mapEl, side);
  stage.append(grid);

  const bgMap = document.createElement('canvas');
  bgMap.className = 'navd__canvas';
  bgMap.setAttribute('aria-hidden', 'true');
  let ready = false, view = { k: 1, cx: 0, cy: 0 };
  const map = createCanvas(mapEl, () => { if (ready) { layoutMap(); paintRoom(); render(); } });
  mapEl.insertBefore(bgMap, map.canvas);
  mapEl.append(badge, flag, illus);
  const streams = createCanvas(streamsEl, () => ready && render());
  const chart = createCanvas(chartEl, () => ready && render());

  const ro = new ResizeObserver(() => {
    const w = shell.root.clientWidth;
    const stacked = w < 760;
    shell.root.classList.toggle('ekf--stacked', stacked);
    mapEl.style.height = stacked ? `${Math.round(w / (compact ? 1.45 : 1.3))}px` : '';
  });
  ro.observe(shell.root);

  function layoutMap() {
    const pad = compact ? 12 : 18;
    const w = map.w, h = map.h;
    const k = Math.min((w - pad * 2) / (ROOM.x1 - ROOM.x0), (h - pad * 2 - (compact ? 10 : 34)) / (ROOM.y1 - ROOM.y0));
    view = { k, cx: w / 2, cy: h / 2 + (compact ? 4 : 14) };
  }
  const S = (x, y) => [view.cx + x * view.k, view.cy - y * view.k];

  // Static room: occupancy-grid style walls with an inflation band, furniture along the walls.
  function paintRoom() {
    bgMap.width = map.canvas.width; bgMap.height = map.canvas.height;
    const c = bgMap.getContext('2d');
    c.setTransform(map.dpr, 0, 0, map.dpr, 0, 0);
    c.fillStyle = P.bg; c.fillRect(0, 0, map.w, map.h);
    c.strokeStyle = P.grid; c.lineWidth = 1;
    c.beginPath();
    for (let x = Math.ceil(ROOM.x0 * 2) / 2; x <= ROOM.x1; x += 0.5) { const [a] = S(x, 0); c.moveTo(Math.round(a) + 0.5, S(0, ROOM.y1)[1]); c.lineTo(Math.round(a) + 0.5, S(0, ROOM.y0)[1]); }
    for (let y = Math.ceil(ROOM.y0 * 2) / 2; y <= ROOM.y1; y += 0.5) { const [, b] = S(0, y); c.moveTo(S(ROOM.x0, 0)[0], Math.round(b) + 0.5); c.lineTo(S(ROOM.x1, 0)[0], Math.round(b) + 0.5); }
    c.stroke();
    const cell = 0.1, ck = cell * view.k;
    const blocks = [];
    for (let x = ROOM.x0; x < ROOM.x1 - 1e-6; x += cell) { blocks.push([x, ROOM.y1 - cell]); blocks.push([x, ROOM.y0]); }
    for (let y = ROOM.y0; y < ROOM.y1 - 1e-6; y += cell) { blocks.push([ROOM.x0, y]); blocks.push([ROOM.x1 - cell, y]); }
    // Furniture along the walls (tables, cabinets)
    const furn = [[-2.8, 1.35, 1.2, 0.55], [1.2, 1.5, 1.5, 0.45], [2.25, -1.95, 0.55, 1.1], [-1.0, -1.95, 1.1, 0.35]];
    for (const [fx, fy, fw, fh] of furn) for (let x = fx; x < fx + fw - 1e-6; x += cell) for (let y = fy; y < fy + fh - 1e-6; y += cell) blocks.push([x, y]);
    c.fillStyle = withAlpha(P.violet, 0.09);
    for (const [x, y] of blocks) { const [a, b] = S(x - 0.12, y + cell + 0.12); c.fillRect(a, b, ck + 0.24 * view.k, ck + 0.24 * view.k); }
    c.fillStyle = P.wall;
    for (const [x, y] of blocks) { const [a, b] = S(x, y + cell); c.fillRect(a + 0.5, b + 0.5, ck - 1, ck - 1); }
    if (!compact) {
      c.fillStyle = P.mute; c.font = `500 10px ${MONO}`;
      c.fillText('LAB · MAP FRAME · 0.5 m GRID', S(ROOM.x0, 0)[0], S(0, ROOM.y1)[1] - 10);
    }
  }

  // ---------- Simulation state ----------
  let t = 0;
  let trail = [], stamps = [], lastStamp = -1, wraps = 0;

  function sampleAt(name, time) {
    const d = data[name], N = d.samples.length;
    const f = ((time % d.total) + d.total) % d.total * HZ;
    const i = Math.floor(f) % N, j = (i + 1) % N, u = f - Math.floor(f);
    const a = d.samples[i], b = d.samples[j];
    const m = (k) => lerp(a[k], b[k], u);
    const mm = (o, k) => lerp(a[o][k], b[o][k], u);
    let th = b.th - a.th; th = a.th + Math.atan2(Math.sin(th), Math.cos(th)) * u;
    const pick = (o) => ({ ex: mm(o, 'ex'), ey: mm(o, 'ey'), sx: mm(o, 'sx'), sy: mm(o, 'sy'), syaw: mm(o, 'syaw'), yaw: mm(o, 'yaw') });
    return { i, x: m('x'), y: m('y'), th, v: m('v'), w: a.w, ox: m('ox'), oy: m('oy'), turn: m('turn'), jerk: m('jerk'), odomV: a.odomV, gyro: a.gyro, ai: pick('ai'), fixed: pick('fixed') };
  }

  function advance(dt) {
    const d = data[regime];
    const before = Math.floor(t / d.total);
    t += dt;
    if (Math.floor(t / d.total) !== before) { wraps++; trail.push(null); }
    const s = sampleAt(regime, t), e = s[mode];
    trail.push({ x: s.x + e.ex, y: s.y + e.ey, ox: s.ox, oy: s.oy, t });
    if (trail.length > 1400) trail.splice(0, trail.length - 1400);
    if (t - lastStamp >= 0.55) {
      lastStamp = t;
      stamps.push({ x: s.x + e.ex, y: s.y + e.ey, th: s.th, sx: e.sx, sy: e.sy, mode, t });
      if (stamps.length > 46) stamps.shift();
    }
    if (auto) {
      cycleT += dt;
      if (cycleT >= CYCLE_SECONDS) {
        cycleT = 0; cycleI = (cycleI + 1) % CYCLE.length;
        const [r, m] = CYCLE[cycleI];
        if (r !== regime) setRegime(r, true); else setMode(m, true);
        if (m !== mode) setMode(m, true);
      }
    }
  }

  // ---------- Drawing: map ----------
  function ellipse(c, x, y, th, rx, ry) {
    c.beginPath(); c.ellipse(x, y, Math.max(1, rx), Math.max(1, ry), -th, 0, Math.PI * 2);
  }

  function drawMap() {
    const c = map.begin();
    c.clearRect(0, 0, map.w, map.h);
    const d = data[regime];
    const s = sampleAt(regime, t), e = s[mode];
    const k = view.k;
    // Ground-truth loop (whole path, faint) and waypoints
    c.strokeStyle = withAlpha(P.fg, 0.16); c.lineWidth = 1; c.setLineDash([4, 5]);
    c.beginPath();
    d.samples.forEach((q, i) => { if (i % 3) return; const [a, b] = S(q.x, q.y); i ? c.lineTo(a, b) : c.moveTo(a, b); });
    c.closePath(); c.stroke(); c.setLineDash([]);
    c.font = `600 ${compact ? 9 : 10}px ${MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    d.waypoints.forEach(([wx, wy], i) => {
      const [a, b] = S(wx, wy);
      c.fillStyle = P.bg2; c.strokeStyle = P.dim; c.lineWidth = 1;
      c.beginPath(); c.arc(a, b, 8, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = P.fg; c.fillText(String(i + 1), a, b + 0.5);
    });
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';

    // Covariance stamps along the estimate: fixed ones never change size, AI ones breathe with the motion.
    for (const st of stamps) {
      const age = clamp((t - st.t) / 14);
      const [a, b] = S(st.x, st.y);
      c.strokeStyle = withAlpha(st.mode === 'ai' ? P.orange : P.fg, (st.mode === 'ai' ? 0.55 : 0.32) * (1 - age));
      c.fillStyle = withAlpha(st.mode === 'ai' ? P.orange : P.fg, 0.05 * (1 - age));
      c.lineWidth = 1;
      ellipse(c, a, b, st.th, 2 * st.sx * k, 2 * st.sy * k); c.fill(); c.stroke();
    }
    // Trails: odometry (cyan, dotted) and EKF estimate (orange)
    const drawTrail = (key, color, width, dash) => {
      c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash);
      c.beginPath();
      let pen = false;
      for (const p of trail) {
        if (!p) { pen = false; continue; }
        const [a, b] = S(p[key[0]], p[key[1]]);
        if (pen) c.lineTo(a, b); else { c.moveTo(a, b); pen = true; }
      }
      c.stroke(); c.setLineDash([]);
    };
    drawTrail(['ox', 'oy'], withAlpha(P.cyan, 0.75), 1.5, [2, 4]);
    drawTrail(['x', 'y'], withAlpha(P.orange, 0.9), 2, []);

    // Live covariance at the robot: 2σ position ellipse plus a ±2σ yaw fan.
    const ex = s.x + e.ex, ey = s.y + e.ey;
    const [rx, ry] = S(ex, ey), [gx, gy] = S(s.x, s.y);
    const fan = clamp(2 * e.syaw, 0.05, 1.3);
    const L = Math.max(36, 0.7 * k);
    const fg = c.createRadialGradient(rx, ry, 0, rx, ry, L);
    fg.addColorStop(0, withAlpha(mode === 'ai' ? P.amber : P.fg, 0.28)); fg.addColorStop(1, withAlpha(mode === 'ai' ? P.amber : P.fg, 0));
    c.fillStyle = fg; c.beginPath(); c.moveTo(rx, ry); c.arc(rx, ry, L, -s.th - fan, -s.th + fan); c.closePath(); c.fill();
    c.strokeStyle = mode === 'ai' ? P.orange : P.fg; c.lineWidth = 2;
    c.fillStyle = withAlpha(mode === 'ai' ? P.orange : P.fg, 0.1);
    ellipse(c, rx, ry, s.th, 2 * e.sx * k, 2 * e.sy * k); c.fill(); c.stroke();

    // Is the truth inside the 2σ ellipse? (Mahalanobis distance in the robot frame)
    const cth = Math.cos(s.th), sth = Math.sin(s.th);
    const dx = s.x - ex, dy = s.y - ey;
    const lx = (dx * cth + dy * sth) / e.sx, ly = (-dx * sth + dy * cth) / e.sy;
    const outside = Math.hypot(lx, ly) > 2;
    flag.classList.toggle('is-on', outside);
    c.strokeStyle = outside ? P.dynamic : withAlpha(P.fg, 0.5); c.lineWidth = outside ? 2 : 1;
    c.beginPath(); c.moveTo(rx, ry); c.lineTo(gx, gy); c.stroke();

    // Ground-truth ghost and EKF robot
    robot(c, gx, gy, s.th, true);
    robot(c, rx, ry, s.th, false);
  }

  function robot(c, x, y, th, ghost) {
    const w = Math.max(16, 0.34 * view.k), h = Math.max(12, 0.26 * view.k);
    c.save(); c.translate(x, y); c.rotate(-th);
    c.lineWidth = 1.4;
    if (ghost) {
      c.setLineDash([3, 3]); c.strokeStyle = P.truth;
      c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, 3); c.stroke(); c.setLineDash([]);
    } else {
      c.fillStyle = P.robotBody; c.strokeStyle = P.robot;
      c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, 3); c.fill(); c.stroke();
      c.fillStyle = P.orange; c.beginPath(); c.moveTo(w / 2 - 1, -h * 0.3); c.lineTo(w / 2 + 5, 0); c.lineTo(w / 2 - 1, h * 0.3); c.closePath(); c.fill();
    }
    c.restore();
  }

  // ---------- Drawing: sensor streams ----------
  function drawStreams() {
    if (compact) return;
    const c = streams.begin();
    const { w, h } = streams;
    c.clearRect(0, 0, w, h);
    const d = data[regime], N = d.samples.length;
    const s = sampleAt(regime, t);
    const rows = [
      { label: '/odom · linear.x', key: 'odomV', range: 0.7, color: P.cyan },
      { label: '/bno055/imu_raw · gyro_z', key: 'gyro', range: 0.9, color: P.mint },
      { label: '/cmd_vel · angular.z', key: 'w', range: 0.9, color: P.amber, bands: true },
      { label: mode === 'ai' ? '/ai_tools/covariance · cov_yaw' : 'covariance · fixed (yaml)', key: 'cov', range: 1, color: mode === 'ai' ? P.orange : P.dim },
    ];
    const rh = h / rows.length, win = 8 * HZ, x0 = 14, x1 = w - 12;
    rows.forEach((r, ri) => {
      const top = ri * rh, mid = top + rh * 0.62, amp = rh * 0.3;
      c.fillStyle = P.mute; c.font = `500 9px ${MONO}`; c.fillText(r.label.toUpperCase(), x0, top + 13);
      c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, mid); c.lineTo(x1, mid); c.stroke();
      if (r.bands) {
        // Regime thresholds from the paper: ±0.01 (static) and ±0.5 rad/s (aggressive, as analysed)
        c.setLineDash([2, 4]); c.strokeStyle = withAlpha(P.dynamic, 0.5);
        for (const v of [0.5, -0.5]) { const yy = mid - (v / r.range) * amp; c.beginPath(); c.moveTo(x0, yy); c.lineTo(x1, yy); c.stroke(); }
        c.setLineDash([]);
      }
      c.strokeStyle = r.color; c.lineWidth = 1.4; c.beginPath();
      for (let j = 0; j <= win; j += 2) {
        const q = d.samples[((s.i - win + j) % N + N) % N];
        let v;
        if (r.key === 'cov') v = mode === 'ai' ? (q.ai.syaw ** 2) / 0.09 * 2 - 0.6 : 0.4;
        else v = q[r.key];
        const xx = x0 + (j / win) * (x1 - x0), yy = mid - clamp(v / r.range, -1.2, 1.2) * amp;
        j ? c.lineTo(xx, yy) : c.moveTo(xx, yy);
      }
      c.stroke();
    });
  }

  // ---------- Drawing: yaw error chart ----------
  function drawChart() {
    const c = chart.begin();
    const { w, h } = chart;
    c.clearRect(0, 0, w, h);
    const d = data[regime], N = d.samples.length;
    const s = sampleAt(regime, t);
    const top = 24, bottom = h - 18, left = 40, right = w - 12;
    const ymax = regime === 'aggressive' ? 1.0 : 0.2;
    const Y = (v) => bottom - clamp(v / ymax, 0, 1.04) * (bottom - top);
    c.font = `500 9px ${MONO}`;
    c.fillStyle = P.mute; c.fillText('|YAW ERROR| (RAD) · ILLUSTRATIVE TRACE', left - 28, 13);
    c.strokeStyle = P.line; c.lineWidth = 1;
    for (const v of [0, ymax / 2, ymax]) {
      const yy = Math.round(Y(v)) + 0.5;
      c.beginPath(); c.moveTo(left, yy); c.lineTo(right, yy); c.stroke();
      c.fillStyle = P.mute; c.textAlign = 'right'; c.fillText(v.toFixed(v ? (ymax < 0.5 ? 2 : 1) : 0), left - 6, yy + 3); c.textAlign = 'left';
    }
    // Paper reference lines (only metrics of the same kind: AI prediction error medians/means/max)
    const refs = [];
    const pa = PAPER.ai[regime];
    if (regime === 'aggressive') refs.push([pa.mean, `paper mean ${pa.mean}`], [pa.max, `paper max ${pa.max}`]);
    else refs.push([pa.median, `paper median ${pa.median}`]);
    c.setLineDash([4, 4]);
    for (const [v, label] of refs) {
      const yy = Y(v);
      c.strokeStyle = withAlpha(P.orange, 0.8); c.beginPath(); c.moveTo(left, yy); c.lineTo(right, yy); c.stroke();
      c.fillStyle = P.orange; c.textAlign = 'right'; c.fillText(label.toUpperCase(), right, yy - 4); c.textAlign = 'left';
    }
    c.setLineDash([]);
    // Traces: the inactive mode faint for comparison, the active one bright with a filled area.
    const win = 10 * HZ;
    const trace = (key, color, width, fill) => {
      c.beginPath();
      for (let j = 0; j <= win; j += 1) {
        const q = d.samples[((s.i - win + j) % N + N) % N];
        const xx = left + (j / win) * (right - left), yy = Y(q[key].yaw);
        j ? c.lineTo(xx, yy) : c.moveTo(xx, yy);
      }
      c.strokeStyle = color; c.lineWidth = width; c.stroke();
      if (fill) { c.lineTo(right, bottom); c.lineTo(left, bottom); c.closePath(); c.fillStyle = fill; c.fill(); }
    };
    const other = mode === 'ai' ? 'fixed' : 'ai';
    trace(other, withAlpha(other === 'ai' ? P.orange : P.fg, 0.28), 1, null);
    trace(mode, mode === 'ai' ? P.orange : P.fg, 1.8, withAlpha(mode === 'ai' ? P.orange : P.fg, 0.08));
    c.fillStyle = P.mute; c.fillText(mode === 'ai' ? 'AI COVARIANCE' : 'FIXED COVARIANCE', left, h - 4);
    c.fillStyle = withAlpha(P.fg, 0.4); c.textAlign = 'right'; c.fillText(`FAINT: ${other === 'ai' ? 'AI' : 'FIXED'}`, right, h - 4); c.textAlign = 'left';
  }

  // ---------- Text: badge, pipeline, readouts ----------
  let textKey = '';
  function updateText() {
    const key = `${mode}|${regime}`;
    if (key === textKey) return;
    textKey = key;
    badge.innerHTML = `<span>Covariance</span><strong class="${mode === 'ai' ? 'is-ai' : ''}">${mode === 'ai' ? 'AI · Random Forest' : 'Fixed · YAML'}</strong>`
      + `<span>Motion</span><strong>${REGIMES[regime].label} · ${REGIMES[regime].cmd}</strong>`;
    pipe.innerHTML = `<b>/odom</b><b>/imu</b><span>→</span><b>EKF</b><span>←</span>`
      + (mode === 'ai' ? '<b class="is-ai">cov = RF(15 features)²</b>' : '<b class="is-fixed">cov = fixed matrix</b>');
    const stats = statsFor(mode, regime);
    read.innerHTML = stats.map((st) => `<div class="ekf__stat${st.warn ? ' is-warn' : ''}"><strong>${st.value}${st.unit ? `<small>${st.unit}</small>` : ''}</strong><span class="tag">${st.label}</span></div>`).join('')
      + `<p class="ekf__note">${noteFor(mode, regime)}</p>`;
    segMode?.set(mode); segRegime?.set(regime);
  }

  // ---------- Frame ----------
  function render() {
    if (!ready) return;
    drawMap(); drawStreams(); drawChart(); updateText();
  }
  const loop = createLoop((dt) => { advance(dt); render(); });

  function setRegime(r, fromCycle) {
    if (!REGIMES[r]) return;
    if (!fromCycle) auto = false;
    regime = r; t = 0; trail = []; stamps = []; lastStamp = -1;
    if (reducedMotion) prefill();
    render();
  }
  function setMode(m, fromCycle) {
    if (m !== 'ai' && m !== 'fixed') return;
    if (!fromCycle) auto = false;
    mode = m;
    if (reducedMotion) prefill();
    render();
  }
  /** Reduced motion: simulate silently to a representative moment so the static frame is complete. */
  function prefill() {
    t = 0; trail = []; stamps = []; lastStamp = -1;
    const end = regime === 'aggressive' ? 10.5 : regime === 'moderate' ? 16 : 12;
    const keepAuto = auto; auto = false;
    while (t < end) advance(1 / HZ);
    auto = keepAuto;
  }

  ready = true;
  layoutMap(); paintRoom();
  if (reducedMotion) { auto = false; prefill(); }
  render();

  return {
    play() { if (!reducedMotion) loop.play(); },
    pause() { loop.pause(); },
    setMode: (m) => setMode(m),
    setRegime: (r) => setRegime(r),
    destroy() { loop.pause(); ro.disconnect(); map.destroy(); streams.destroy(); chart.destroy(); shell.destroy(); },
  };
}

/** The two headline numbers for the current state, all from the paper. */
function statsFor(mode, regime) {
  if (mode === 'ai') {
    const a = PAPER.ai[regime];
    if (regime === 'aggressive') return [
      { value: fmt(a.mean), unit: 'rad', label: 'Mean |error_yaw − yaw_diff|', warn: true },
      { value: fmt(a.max), unit: 'rad', label: 'Max prediction error', warn: true },
    ];
    return [
      { value: fmt(a.median), unit: 'rad', label: 'Median |error_yaw − yaw_diff|' },
      { value: fmt(a.iqr), unit: 'rad', label: 'yaw_diff IQR · AI on' },
    ];
  }
  const f = PAPER.fixed[regime];
  if (!f) return [
    { value: 'n/a', label: 'No AI-off samples above 0.7 rad/s' },
    { value: fmt(PAPER.fixed.maxAbs), unit: 'rad', label: 'Max |yaw_diff| · whole AI-off run' },
  ];
  return [
    { value: fmt(f.iqr), unit: 'rad', label: 'yaw_diff IQR · AI off' },
    f.std ? { value: fmt(f.std), unit: 'rad', label: 'yaw_diff σ · AI off' } : { value: fmt(PAPER.ai[regime].iqr), unit: 'rad', label: 'Same metric with AI on' },
  ];
}

function noteFor(mode, regime) {
  const m = PAPER.model;
  if (mode === 'fixed') {
    if (regime === 'static') return '<b>Fixed covariance.</b> robot_localization weighs odometry and IMU with the same matrices whatever the robot does. Driving straight, the AI-off baseline is already tight.';
    if (regime === 'moderate') return `<b>Fixed covariance in turns.</b> The baseline spread widens to an IQR of ${PAPER.fixed.moderate.iqr} rad, against ${PAPER.ai.moderate.iqr} rad with AI covariance.`;
    return '<b>No baseline here.</b> The AI-off log never exceeded the regime threshold, so the paper has no fixed-covariance number for sharp turns.';
  }
  if (regime === 'static') return `<b>AI covariance.</b> A Random Forest (MAE ${m.mae}, R² ${m.r2}) predicts error_x, error_y and error_yaw from ${m.features} sensor features; their squares become the EKF covariance.`;
  if (regime === 'moderate') return `<b>Where it helps.</b> In moderate turns the median yaw prediction error stays at ${PAPER.ai.moderate.median} rad and the yaw_diff spread is tighter than with fixed covariance.`;
  return `<b>The hard case.</b> Sharp turns were rare in the ${m.samples} training samples. Errors climb to a mean of ${PAPER.ai.aggressive.mean} rad and peak at ${PAPER.ai.aggressive.max} rad; the paper names this its main limitation.`;
}
