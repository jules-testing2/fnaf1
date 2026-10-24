// asf-fusion: step-by-step Angular Sector Fusion (Sensors 2026, 26, 2232, Section 3.2).
// A YOLO box's horizontal extent becomes an angular sector of the 2D LiDAR scan; the 25th percentile of the
// valid returns inside it is the range; the point is placed in the map frame and tagged with its mobility class.
//
// Options: compact, bare, theme ("dark" | "paper"), height, aspect, target (0 person, 1 potted plant, 2 bottle).
// Returned API adds setStep(i) and setProgress(p) so a page can drive it from scroll; it auto-plays otherwise.

import './perception/perception.css';
import { buildFrame, createCanvas, createLoop, palette, applySize, clamp, lerp, smooth, easeOut, rgba, rng, DEG } from './perception/common.js';
import { sceneAt, scanAt, asfLocalize, CAM, LIDAR, MOBILITY, CLASSES, FUSION } from './perception/world.js';
import { renderCamera, detectCandidates, makeCamera } from './perception/camera.js';
import { drawDetections, classColor } from './perception/detector.js';
import { makeView, drawGrid, drawWalls, drawFootprints, drawRobot, drawScan, wedge, drawSweep } from './perception/topdown.js';

const STEP_DUR = 2.9;
const HOLD = 1.6;
const ROBOT = { x: 1.0, y: -0.3 };
const PERSON = { x: 4.3, y: 0.35, heading: Math.PI, phase: 0, walking: false, id: 'asf:person' };
const TARGETS = [{ cls: 'person', yaw: 0 }, { cls: 'potted plant', yaw: 0 }, { cls: 'bottle', yaw: 40 * DEG }];
const STEP_NAMES = ['Detect', 'Project to sector', 'Collect returns', '25th percentile range', 'Place in map frame', 'Classify mobility'];

const deg = (r) => `${r < 0 ? '−' : ''}${Math.abs(r / DEG).toFixed(1)}°`;
const num = (v, d = 2) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`;
const ttlText = (m) => (Number.isFinite(MOBILITY[m].ttl) ? `${MOBILITY[m].ttl} s` : '∞ (permanent)');

/** Precomputes everything one target needs: scene, a frozen scan, the YOLO box and the ASF result. */
function solveTarget(target, seed) {
  const robot = { ...ROBOT, yaw: target.yaw };
  const scene = sceneAt(0, { robot, person: PERSON });
  const scan = scanAt(scene, rng(seed));
  const cands = detectCandidates(scene, 4 / 3);
  const box = cands.find((c) => c.cls === target.cls);
  const asf = asfLocalize(box, scan);
  return { ...target, robot, scene, scan, cands, box, asf, mobility: CLASSES[target.cls].mobility };
}

function caption(step, T) {
  const a = T.asf, m = MOBILITY[T.mobility];
  return [
    `YOLO26n finds a <b>${T.cls}</b> (${T.box.conf.toFixed(2)}) in the 640×480 frame. ASF only needs the box's horizontal extent: x<sub>min</sub> ${Math.round(a.xmin)} px to x<sub>max</sub> ${Math.round(a.xmax)} px.`,
    `Pinhole model, θ = atan2(x − c<sub>x</sub>, f<sub>x</sub>) with f<sub>x</sub> 687.54 px and c<sub>x</sub> 308.11 px read from CameraInfo. A sign flip maps the box into the LiDAR frame: <b>${deg(a.lmin)} to ${deg(a.lmax)}</b>.`,
    `The latest /scan (503 rays, 0.716° apart) gives <b>${a.idx.length} rays</b> inside the sector; ${a.sorted.length} are valid. At least ${FUSION.minRays} valid rays are required.`,
    `The 25th percentile of the valid ranges is the distance: <b>d = ${a.d.toFixed(2)} m</b>. It favours the nearest surface, so returns from the background (median ${a.median.toFixed(2)} m) do not drag the estimate away.`,
    `x = d·cos θ<sub>c</sub>, y = d·sin θ<sub>c</sub> in base_laser, then TF2 resolves base_laser → base_link → odom → map: <b>(${num(a.mx)}, ${num(a.my)}) m</b>. Under 1 ms per detection on the RPi 5.`,
    `A ${T.cls} is <b>${T.mobility}</b>: base penalty ${m.penalty.toFixed(1)}, speed limit ${m.speed} %, TTL ${ttlText(T.mobility)}. It is written to semantic_objects.geojson and penalises route-graph edges within 1.5 m.`,
  ][step];
}

export default function mount(el, { options = {}, reducedMotion = false } = {}) {
  const compact = !!options.compact;
  const pal = palette(options.theme);
  const { root, right, body } = buildFrame(el, { title: 'Angular Sector Fusion · semantic_localizer', meta: compact ? '' : '3 Hz · &lt; 1 ms / detection', options, kind: 'asf' });
  const targets = TARGETS.map((t, i) => solveTarget(t, 21 + i));
  const accentHex = pal.hex('orange');
  // Diagram colours: tokens as-is on dark, darkened on paper so they keep contrast.
  const ctk = Object.fromEntries(Object.keys(pal.tk).map((k) => [k, pal.hex(k)]));

  /* ---------- DOM ---------- */
  body.innerHTML = `
    <div class="asf-grid">
      <div class="asf-main"></div>
      <div class="asf-side">
        <figure class="asf-card asf-card--cam"><figcaption class="mono">1 · Camera · 640×480 · YOLO26n</figcaption><div class="asf-cam"></div></figure>
        <figure class="asf-card asf-card--hist"><figcaption class="mono asf-hist-title">Sector ranges</figcaption><div class="asf-hist"></div><pre class="asf-geo" aria-label="GeoJSON feature"></pre></figure>
      </div>
    </div>
    <dl class="asf-read"></dl>
    <div class="asf-steps">
      <ol class="asf-steps__list" aria-label="Fusion steps">${STEP_NAMES.map((n, i) => `<li><button type="button" class="asf-step" data-i="${i}"><span class="asf-step__n">${i + 1}</span><span class="asf-step__t">${n}</span></button></li>`).join('')}</ol>
      <p class="asf-caption" aria-live="polite"></p>
    </div>`;
  const main = body.querySelector('.asf-main');
  applySize(main, options, compact ? 1.5 : 1.6);
  let toggle = null;
  if (right && !reducedMotion) {
    toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'pcp-btn mono'; toggle.textContent = 'Pause';
    toggle.setAttribute('aria-label', 'Pause the automatic walkthrough');
    right.appendChild(toggle);
  }
  const mainView = createCanvas(main, { label: 'Top-down map view: the robot, its 360 degree 2D LiDAR scan and the camera field of view. A detected object\'s box becomes an angular sector, the LiDAR returns inside it are collected, their 25th percentile gives the range, and the object is placed in the map frame with its mobility class.', onResize: () => draw() });
  const camView = createCanvas(body.querySelector('.asf-cam'), { label: 'Robot camera image with the YOLO26n box and its x_min and x_max pixel columns.', onResize: () => draw() });
  const histView = createCanvas(body.querySelector('.asf-hist'), { label: 'Bar chart of the LiDAR ranges inside the sector, sorted, with the 25th percentile marked.', onResize: () => draw() });
  const readEl = body.querySelector('.asf-read');
  const capEl = body.querySelector('.asf-caption');
  const geoEl = body.querySelector('.asf-geo');
  const histTitle = body.querySelector('.asf-hist-title');
  const stepBtns = [...body.querySelectorAll('.asf-step')];

  /* ---------- State ---------- */
  // lockAt: time the target box starts its lock-on animation (-1 = start it as soon as the robot faces the target).
  const st = { target: clamp(options.target | 0, 0, TARGETS.length - 1), step: 0, frac: 0, prevYaw: null, auto: !reducedMotion, anim: null, t: 0, lockAt: reducedMotion ? -10 : -1, cycle: 0 };
  if (reducedMotion) { st.step = 5; st.frac = 1; }
  let lastCaption = '', lastStep = -1, lastTarget = -1;

  function setState(target, step, frac) {
    if (target !== st.target) { st.prevYaw = targets[st.target].yaw; st.target = target; }
    st.step = step; st.frac = frac;
  }

  /* ---------- Main top-down ---------- */
  function drawMain(T, yaw) {
    const { ctx, size } = mainView;
    const rect = { x: 0, y: 0, w: size.w, h: size.h };
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, size.w, size.h);
    const v = makeView({ x: 10, y: 10, w: size.w - 20, h: size.h - 20 }, { x0: 0.05, x1: 5.6, y0: -1.75, y1: 1.85 });
    drawGrid(ctx, v, pal);
    // Map origin axes (ROS colours: x red, y green).
    const O = [v.X(0), v.Y(0)], ax = Math.max(18, 0.4 * v.s);
    ctx.lineWidth = 2;
    ctx.strokeStyle = pal.accent('danger'); ctx.beginPath(); ctx.moveTo(O[0], O[1]); ctx.lineTo(O[0] + ax, O[1]); ctx.stroke();
    ctx.strokeStyle = pal.accent('mint'); ctx.beginPath(); ctx.moveTo(O[0], O[1]); ctx.lineTo(O[0], O[1] - ax); ctx.stroke();
    const f = Math.max(9, Math.min(12, size.w / 80));
    const mono = (w = 500, s = f) => `${w} ${s}px "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace`;
    ctx.font = mono(); ctx.fillStyle = pal.dim; ctx.textBaseline = 'middle';
    ctx.fillText('map', O[0] + 5, O[1] + f);
    drawWalls(ctx, v, pal);
    const scene = { ...T.scene, t: st.t, robot: { ...T.robot, yaw } };
    drawFootprints(ctx, v, scene, pal, { alpha: 0.7 });

    const scan = st.liveScan;
    const pose = scan.pose;
    const col = classColor(T.cls, ctk);
    const s = st.step, fr = st.frac, a = T.asf;
    const settled = Math.abs(yaw - T.yaw) < 0.002;

    // Camera FOV (+/- 24.9 deg).
    ctx.save();
    wedge(ctx, v, { ...pose, yaw }, -CAM.hfov / 2, CAM.hfov / 2, 6.2);
    ctx.fillStyle = rgba(pal.paper ? '#17161a' : '#f3eee4', 0.045); ctx.fill();
    ctx.setLineDash([4, 5]); ctx.strokeStyle = pal.lineStrong; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    if (!compact) {
      const ex = pose.x + Math.cos(yaw + CAM.hfov / 2) * 2.2, ey = pose.y + Math.sin(yaw + CAM.hfov / 2) * 2.2;
      ctx.font = mono(500, f - 1); ctx.fillStyle = pal.mute; ctx.fillText('camera FOV ±24.9°', v.X(ex) + 6, v.Y(ey) - 8);
    }

    // Spinning LiDAR sweep (slowed down for the eye; the LD19 turns at 10 Hz).
    const sweep = (st.t * 2.4) % (Math.PI * 2);
    if (!reducedMotion) drawSweep(ctx, v, pose, sweep + pose.yaw, pal.hex('amber'), 6.5);

    const inSector = (i) => settled && s >= 2 && a.idx.includes(i);
    const reveal = s > 2 ? 1 : s === 2 ? easeOut(fr * 1.4) : 0;
    const ptCol = pal.hex('amber');
    drawScan(ctx, v, scan, (i, r, ang) => {
      const rec = (((sweep - (ang - pose.yaw)) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2);
      const base = reducedMotion ? 0.8 : 1 - 0.6 * rec;
      if (inSector(i)) {
        const k = a.idx.indexOf(i) / Math.max(1, a.idx.length - 1);
        if (k > reveal) return [rgba(ptCol, base * 0.5), 1.6];
        const bgPt = s >= 3 && r > a.d + 0.3;
        return [bgPt ? rgba(pal.paper ? '#17161a' : '#f3eee4', 0.4) : col, bgPt ? 2 : 3];
      }
      return [rgba(ptCol, base * (s >= 2 && settled ? 0.3 : 0.75)), 1.5];
    });

    if (settled && s >= 1) {
      // Angular sector of the box.
      const open = s > 1 ? 1 : easeOut(fr * 1.3);
      const c = a.center, half = ((a.lmax - a.lmin) / 2) * open;
      ctx.save();
      wedge(ctx, v, pose, c - half, c + half, 6.2);
      const g = ctx.createRadialGradient(v.X(pose.x), v.Y(pose.y), 0, v.X(pose.x), v.Y(pose.y), 6.2 * v.s);
      g.addColorStop(0, rgba(col, 0.3)); g.addColorStop(1, rgba(col, 0.04));
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
      if (!compact && open > 0.95) {
        ctx.font = mono(600, f - 1); ctx.fillStyle = col;
        for (const [ang, lab] of [[a.lmax, `θ max ${deg(a.lmax)}`], [a.lmin, `θ min ${deg(a.lmin)}`]]) {
          const R = 1.25, x = pose.x + Math.cos(pose.yaw + ang) * R, y = pose.y + Math.sin(pose.yaw + ang) * R;
          ctx.fillText(lab, v.X(x) + 4, v.Y(y) + (ang === a.lmax ? -9 : 9));
        }
      }
    }
    if (settled && s >= 2) {
      // Rays inside the sector, drawn one after another.
      ctx.save(); ctx.lineWidth = 1;
      a.idx.forEach((i, n) => {
        if (n / Math.max(1, a.idx.length - 1) > reveal) return;
        const r = T.scan.ranges[i]; if (!Number.isFinite(r)) return;
        const ang = pose.yaw + LIDAR.angleMin + i * LIDAR.inc;
        ctx.strokeStyle = rgba(col, s >= 3 && r > a.d + 0.3 ? 0.18 : 0.55);
        ctx.beginPath(); ctx.moveTo(v.X(pose.x), v.Y(pose.y)); ctx.lineTo(v.X(pose.x + Math.cos(ang) * r), v.Y(pose.y + Math.sin(ang) * r)); ctx.stroke();
      });
      ctx.restore();
    }
    if (settled && s >= 3) {
      // The 25th percentile range as an arc across the sector.
      const k = s > 3 ? 1 : easeOut(fr * 1.5), R = a.d * v.s;
      ctx.save();
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      const c = pose.yaw + a.center, half = ((a.lmax - a.lmin) / 2 + 2 * DEG) * k;
      ctx.beginPath(); ctx.arc(v.X(pose.x), v.Y(pose.y), R, -(c + half), -(c - half)); ctx.stroke();
      if (!compact) {
        ctx.font = mono(600, f); ctx.fillStyle = col;
        const lx = pose.x + Math.cos(c + (a.lmax - a.lmin) / 2 + 5 * DEG) * a.d, ly = pose.y + Math.sin(c + (a.lmax - a.lmin) / 2 + 5 * DEG) * a.d;
        ctx.globalAlpha = k; ctx.fillText(`d = P25 = ${a.d.toFixed(2)} m`, v.X(lx) + 4, v.Y(ly) - 4);
      }
      ctx.restore();
    }
    if (settled && s >= 4) {
      // The object point in the map frame, with its coordinates.
      const k = s > 4 ? 1 : easeOut(fr * 1.6);
      const X = v.X(a.mx), Y = v.Y(a.my);
      ctx.save();
      ctx.setLineDash([3, 4]); ctx.strokeStyle = rgba(col, 0.6 * k); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X, O[1]); ctx.moveTo(X, Y); ctx.lineTo(O[0], Y); ctx.stroke(); ctx.setLineDash([]);
      const drop = (1 - k) * 26;
      ctx.fillStyle = col; ctx.strokeStyle = pal.bg; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X, Y - drop, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.font = mono(600, f); ctx.fillStyle = pal.fg; ctx.globalAlpha = k;
      const label = `(${num(a.mx)}, ${num(a.my)}) m`;
      const tx = Math.min(X + 12, v.rect.x + v.rect.w - ctx.measureText(label).width - 4);
      ctx.fillText(label, tx, Y - 14);
      if (!compact) { ctx.font = mono(500, f - 1); ctx.fillStyle = pal.dim; ctx.fillText('base_laser → base_link → odom → map', 16, size.h - 16 - f); }
      ctx.restore();
    }
    if (settled && s >= 5) {
      // Mobility tag and the 1.5 m radius within which the object penalises graph edges.
      const k = s > 5 ? 1 : easeOut(fr * 1.6);
      const X = v.X(a.mx), Y = v.Y(a.my), m = MOBILITY[T.mobility];
      ctx.save();
      ctx.globalAlpha = k;
      ctx.setLineDash([2, 5]); ctx.strokeStyle = rgba(col, 0.7); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(X, Y, 1.5 * v.s * k, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = rgba(col, 0.08); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X, Y, 11 + (1 - k) * 10, 0, Math.PI * 2); ctx.stroke();
      const tag = `${T.mobility.toUpperCase()} · +${m.penalty.toFixed(0)} · ${m.speed}%`;
      ctx.font = mono(600, f);
      const tw = ctx.measureText(tag).width + 14, th = f + 10;
      const tx = clamp(X - tw / 2, 6, size.w - tw - 6), ty = Y + 18 + th > size.h - 4 ? Y - 30 - th : Y + 18;
      ctx.fillStyle = col; ctx.fillRect(tx, ty, tw, th);
      ctx.fillStyle = pal.paper ? '#fffaf0' : '#0a0a0b'; ctx.fillText(tag, tx + 7, ty + th / 2 + 0.5);
      ctx.restore();
    }
    drawRobot(ctx, v, { ...T.robot, yaw }, pal, { accent: accentHex });
    // Corner labels.
    ctx.font = mono(500, f - 1); ctx.fillStyle = pal.mute; ctx.textAlign = 'right';
    ctx.fillText(compact ? 'MAP FRAME' : 'MAP FRAME · TOP-DOWN · 0.5 m GRID', size.w - 14, 18);
    ctx.textAlign = 'left';
  }

  /* ---------- Camera inset ---------- */
  function drawCam(T, yaw) {
    const { ctx, size } = camView;
    const rect = { x: 0, y: 0, w: size.w, h: size.h };
    const robot = { ...T.robot, yaw };
    const scene = { ...T.scene, robot, t: st.t, person: { ...PERSON }, objects: T.scene.objects };
    renderCamera(ctx, rect, scene);
    const vg = ctx.createRadialGradient(rect.w / 2, rect.h / 2, rect.h * 0.3, rect.w / 2, rect.h / 2, rect.w * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, rect.w, rect.h);
    const settled = Math.abs(yaw - T.yaw) < 0.002;
    if (!settled) return;
    const tk = pal.tk;
    const boxes = T.cands.filter((c) => c.conf >= 0.45).map((c) => ({ ...c, born: c.id === T.box.id ? st.lockAt : -10, alpha: 1 }));
    drawDetections(ctx, rect, boxes, st.t, tk, { font: Math.max(9, Math.min(11, size.w / 34)), highlight: T.box.id, dim: true });
    const s = st.step;
    if (s >= 1) {
      const a = T.asf, cam = makeCamera(robot, rect);
      const k = s > 1 ? 1 : easeOut(st.frac * 1.4);
      const xs = [[a.xmin, 'x_min'], [a.xmax, 'x_max']];
      const col = classColor(T.cls, tk);
      ctx.save();
      ctx.globalAlpha = k;
      ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      const pp = cam.cx;
      ctx.beginPath(); ctx.moveTo(pp, 0); ctx.lineTo(pp, rect.h); ctx.stroke();
      ctx.strokeStyle = col;
      ctx.font = `600 ${Math.max(9, Math.min(11, size.w / 34))}px "JetBrains Mono Variable", ui-monospace, monospace`;
      ctx.textBaseline = 'bottom';
      for (const [px, lab] of xs) {
        const X = (px / CAM.width) * rect.w;
        ctx.beginPath(); ctx.moveTo(X, 0); ctx.lineTo(X, rect.h); ctx.stroke();
        ctx.fillStyle = 'rgba(10,10,11,0.75)';
        const txt = `${lab} ${Math.round(px)}`, tw = ctx.measureText(txt).width + 8;
        const tx = lab === 'x_min' ? X - tw - 2 : X + 2;
        ctx.fillRect(clamp(tx, 0, rect.w - tw), rect.h - 20, tw, 17);
        ctx.fillStyle = col; ctx.fillText(txt, clamp(tx, 0, rect.w - tw) + 4, rect.h - 5);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.textBaseline = 'top';
      ctx.fillText('cₓ', pp + 3, 4);
      ctx.restore();
    }
  }

  /* ---------- Sorted ranges chart ---------- */
  function drawHist(T) {
    const { ctx, size } = histView;
    ctx.clearRect(0, 0, size.w, size.h);
    const a = T.asf, s = st.step;
    if (s < 2 || !a.ok) {
      ctx.fillStyle = pal.mute; ctx.font = `500 11px "JetBrains Mono Variable", ui-monospace, monospace`; ctx.textBaseline = 'middle';
      ctx.fillText('waiting for the sector…', 10, size.h / 2);
      return;
    }
    // Ranges in ray order; from step 4 they slide into sorted order and the percentile is marked.
    const raw = a.idx.map((i) => T.scan.ranges[i]).filter(Number.isFinite);
    const sortedIdx = raw.map((r, i) => [r, i]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
    const rank = new Array(raw.length); sortedIdx.forEach((orig, k) => { rank[orig] = k; });
    const sortT = s > 3 ? 1 : s === 3 ? smooth(st.frac * 1.6) : 0;
    const grow = s > 2 ? 1 : easeOut(st.frac * 1.4);
    const pad = { l: 34, r: 10, t: 14, b: 18 };
    const W = size.w - pad.l - pad.r, H = size.h - pad.t - pad.b;
    const top = Math.min(8, Math.max(...raw) * 1.05), y = (r) => pad.t + H - (Math.min(r, top) / top) * H;
    const col = classColor(T.cls, ctk);
    const bw = W / raw.length;
    ctx.font = `500 10px "JetBrains Mono Variable", ui-monospace, monospace`; ctx.textBaseline = 'middle';
    ctx.strokeStyle = pal.line; ctx.lineWidth = 1; ctx.fillStyle = pal.mute;
    for (let m = 0; m <= top; m += top > 4 ? 2 : 1) { const Y = Math.round(y(m)) + 0.5; ctx.beginPath(); ctx.moveTo(pad.l, Y); ctx.lineTo(pad.l + W, Y); ctx.stroke(); ctx.fillText(`${m} m`, 2, Y); }
    raw.forEach((r, i) => {
      const slot = lerp(i, rank[i], sortT);
      const X = pad.l + slot * bw + 1, h = (pad.t + H - y(r)) * grow;
      const bg = sortT > 0.5 && r > a.d + 0.3;
      ctx.fillStyle = bg ? pal.lineStrong : rgba(col, 0.85);
      ctx.fillRect(X, pad.t + H - h, Math.max(1, bw - 2), h);
      if (r > top) { ctx.fillStyle = pal.bg; ctx.fillRect(X, pad.t + 3, Math.max(1, bw - 2), 2); }
    });
    if (s >= 3) {
      const k = s > 3 ? 1 : smooth((st.frac - 0.45) * 2.5);
      ctx.globalAlpha = k;
      const Y = y(a.d);
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pad.l, Y); ctx.lineTo(pad.l + W, Y); ctx.stroke();
      ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.strokeStyle = pal.dim;
      const Ym = y(a.median); ctx.beginPath(); ctx.moveTo(pad.l, Ym); ctx.lineTo(pad.l + W, Ym); ctx.stroke(); ctx.setLineDash([]);
      ctx.textAlign = 'right';
      ctx.fillStyle = col; ctx.fillText(`P25 ${a.d.toFixed(2)} m`, pad.l + W, Y - 8);
      ctx.fillStyle = pal.dim; ctx.fillText(`median ${a.median.toFixed(2)} m`, pad.l + W, Math.max(pad.t, Ym - 8));
      ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
    ctx.fillStyle = pal.mute; ctx.fillText(sortT > 0.5 ? 'sorted ranges' : 'rays in sector', pad.l, size.h - 7);
  }

  /* ---------- DOM text ---------- */
  function updateText(T) {
    const s = st.step, a = T.asf, m = MOBILITY[T.mobility];
    const cap = caption(s, T);
    if (cap !== lastCaption) { capEl.innerHTML = `<span class="asf-caption__n">${s + 1}/6</span> ${cap}`; lastCaption = cap; }
    if (s !== lastStep || st.target !== lastTarget) {
      stepBtns.forEach((b, i) => { b.classList.toggle('is-active', i === s); b.classList.toggle('is-done', i < s); b.setAttribute('aria-current', i === s ? 'step' : 'false'); });
      const rows = [
        ['Class', `${T.cls} · ${T.box.conf.toFixed(2)}`, 0],
        ['x_min … x_max', `${Math.round(a.xmin)} … ${Math.round(a.xmax)} px`, 0],
        ['LiDAR sector', `${deg(a.lmin)} … ${deg(a.lmax)}`, 1],
        ['Rays · valid', `${a.idx.length} · ${a.sorted.length}`, 2],
        ['Range d (P25)', `${a.d.toFixed(2)} m`, 3],
        ['Map (x, y)', `(${num(a.mx)}, ${num(a.my)}) m`, 4],
        ['Mobility', T.mobility, 5],
        ['Penalty · speed · TTL', `${m.penalty.toFixed(1)} · ${m.speed} % · ${ttlText(T.mobility).replace(' (permanent)', '')}`, 5],
      ];
      readEl.innerHTML = rows.map(([k, val, at]) => `<div class="${at <= s ? 'is-on' : ''}"><dt class="mono">${k}</dt><dd>${at <= s ? val : '—'}</dd></div>`).join('');
      const geo = s >= 5;
      histTitle.textContent = geo ? 'semantic_objects.geojson' : s >= 3 ? 'Sector ranges · 25th percentile' : 'Sector ranges';
      body.querySelector('.asf-card--hist').classList.toggle('is-geo', geo);
      geoEl.textContent = geo ? JSON.stringify({ type: 'Feature', geometry: { type: 'Point', coordinates: [+a.mx.toFixed(4), +a.my.toFixed(4)] }, properties: { class_name: T.cls, mobility: T.mobility, confidence: +T.box.conf.toFixed(3), ttl_seconds: Number.isFinite(m.ttl) ? m.ttl : -1.0 } }, null, 1).replace(/\n\s*/g, ' ').replace('"properties"', '\n "properties"').replace('"geometry"', '\n "geometry"') : '';
      lastStep = s; lastTarget = st.target;
    }
  }

  /* ---------- Frame ---------- */
  function draw() {
    const T = targets[st.target];
    // Prescan-style turn toward a target that needs another heading (first part of step 1).
    let yaw = T.yaw;
    if (st.prevYaw !== null && st.step === 0) {
      const k = smooth(st.frac / 0.4);
      yaw = lerp(st.prevYaw, T.yaw, k);
      if (k >= 1) st.prevYaw = null;
    } else st.prevYaw = null;
    const settled = Math.abs(yaw - T.yaw) < 0.002;
    if (st.step === 0 && settled && st.lockAt < 0) st.lockAt = st.t;
    // A fresh /scan every 0.1 s (10 Hz) so the points shimmer like the real sensor.
    const scanTick = Math.floor(st.t * LIDAR.rate);
    if (!st.liveScan || st.scanTick !== scanTick || st.scanYaw !== yaw || st.scanTarget !== st.target) {
      const scene = { ...T.scene, t: st.t, robot: { ...T.robot, yaw } };
      st.liveScan = settled && st.step >= 2 ? T.scan : scanAt(scene, rng(1000 + scanTick));
      st.scanTick = scanTick; st.scanYaw = yaw; st.scanTarget = st.target;
    }
    drawMain(T, yaw);
    drawCam(T, yaw);
    if (!compact) drawHist(T);
    updateText(T);
  }

  /* ---------- Playback ---------- */
  const loop = createLoop((t, dt) => {
    st.t = t;
    if (st.anim) {
      st.anim.k = Math.min(1, st.anim.k + dt / 1.1);
      st.frac = st.anim.k;
      if (st.anim.k >= 1) st.anim = null;
    } else if (st.auto) {
      const total = STEP_DUR * 6 + HOLD;
      st.cycle += dt;
      if (st.cycle >= total) { st.cycle = 0; setState((st.target + 1) % targets.length, 0, 0); st.lockAt = -1; }
      const s = Math.min(5, Math.floor(st.cycle / STEP_DUR));
      setState(st.target, s, Math.min(1, (st.cycle - s * STEP_DUR) / STEP_DUR));
    }
    draw();
  });

  function stopAuto() {
    st.auto = false;
    if (toggle) { toggle.textContent = 'Play'; toggle.setAttribute('aria-label', 'Resume the automatic walkthrough'); }
  }
  function startAuto() {
    st.auto = true; st.cycle = st.step * STEP_DUR; st.anim = null;
    if (toggle) { toggle.textContent = 'Pause'; toggle.setAttribute('aria-label', 'Pause the automatic walkthrough'); }
  }
  toggle?.addEventListener('click', () => (st.auto ? stopAuto() : startAuto()));

  function setStep(i) {
    stopAuto();
    const s = clamp(i | 0, 0, 5);
    if (s === 0 && st.step !== 0 && !reducedMotion) st.lockAt = -1;
    st.step = s;
    if (reducedMotion) st.frac = 1; else st.anim = { k: 0 };
    if (!loop.playing) draw();
  }
  function setProgress(p) {
    stopAuto();
    st.anim = null;
    const x = clamp(p) * 6, s = Math.min(5, Math.floor(x));
    if (s === 0 && st.step !== 0 && !reducedMotion) st.lockAt = -1;
    setState(st.target, s, reducedMotion ? 1 : Math.min(1, x - s));
    if (!loop.playing) draw();
  }
  stepBtns.forEach((b) => b.addEventListener('click', () => setStep(+b.dataset.i)));

  root.classList.add('is-ready');
  draw();

  return {
    play() { if (!reducedMotion) loop.play(); },
    pause() { loop.pause(); },
    destroy() { loop.pause(); mainView.destroy(); camView.destroy(); histView.destroy(); root.remove(); },
    setStep,
    setProgress,
  };
}
