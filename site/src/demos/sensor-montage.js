// sensor-montage: one synchronised run seen through every layer at once, RoM-Nav style.
//   01 camera + YOLO26n boxes        02 2D LiDAR + Angular Sector Fusion (3 Hz) building the semantic map
//   03 semantic route (route-replan)  04 telemetry: detector rate, CPU, fusion, map, speed limit, pose
// Panels 01, 02 and 04 share one clock and one corridor; 03 mounts the `route-replan` demo (owned by the
// navigation demos) in bare/compact mode, playing and pausing with the montage, and shows a static Route
// Server graph if that module is missing.
//
// Options: compact, bare, theme ("dark" | "paper").

import './perception/perception.css';
import { buildFrame, createCanvas, createLoop, palette, clamp, rgba, rng, noise1, DEG } from './perception/common.js';
import { createCameraView } from './perception/camera-view.js';
import { classColor } from './perception/detector.js';
import { sceneAt, scanAt, asfLocalize, SemanticMap, CAM, LIDAR, FUSION, MOBILITY, LOOP, BAY } from './perception/world.js';
import { makeView, drawGrid, drawWalls, drawRobot, drawScan, wedge, drawSweep } from './perception/topdown.js';

// Optional sibling demo: resolved at build time, empty if the file does not exist yet.
const routeModules = import.meta.glob('./route-replan.js');

const START = 3.0;
const PROXIMITY = 1.5;      // metres within which an object penalises a route-graph edge

/** Static fallback for panel 03: the 7-node FIIR graph (Table 5) with the direct route 0 -> 2 -> 7. */
function drawGraphPlaceholder(ctx, size, pal) {
  const nodes = { 0: [1, 0], 2: [3.4, 0], 3: [2.4, 1], 4: [2.4, -0.5], 5: [4.8, 1], 6: [4.8, -0.5], 7: [6.7, 0] };
  const edges = [[0, 2], [0, 3], [0, 4], [2, 3], [2, 4], [2, 5], [2, 6], [2, 7], [5, 7], [6, 7]];
  const v = makeView({ x: 16, y: 16, w: size.w - 32, h: size.h - 40 }, { x0: 0.6, x1: 7.1, y0: -0.9, y1: 1.4 });
  ctx.clearRect(0, 0, size.w, size.h);
  ctx.lineWidth = 2; ctx.strokeStyle = pal.lineStrong;
  for (const [a, b] of edges) { ctx.beginPath(); ctx.moveTo(v.X(nodes[a][0]), v.Y(nodes[a][1])); ctx.lineTo(v.X(nodes[b][0]), v.Y(nodes[b][1])); ctx.stroke(); }
  ctx.strokeStyle = pal.hex('orange'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(v.X(1), v.Y(0)); ctx.lineTo(v.X(6.7), v.Y(0)); ctx.stroke();
  ctx.font = '500 10px "JetBrains Mono Variable", ui-monospace, monospace'; ctx.textBaseline = 'middle';
  for (const [id, [x, y]] of Object.entries(nodes)) {
    ctx.fillStyle = pal.bg; ctx.strokeStyle = pal.fg; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(v.X(x), v.Y(y), 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = pal.dim; ctx.fillText(id, v.X(x) + 10, v.Y(y) - 10);
  }
  ctx.fillStyle = pal.mute; ctx.fillText('Route Server graph · 7 nodes · 20 directed edges', 16, size.h - 14);
}

export default function mount(el, { options = {}, reducedMotion = false } = {}) {
  const compact = !!options.compact;
  const pal = palette(options.theme);
  const tk = pal.tk;
  const { root, body } = buildFrame(el, {
    title: 'Xplorer · adaptive run · synchronised sensors',
    meta: compact ? '' : 'ROS 2 Jazzy · Nav2 1.3.10 · RPi 5',
    options, kind: 'montage',
  });

  body.innerHTML = `
    <div class="mtg-grid">
      <section class="mtg-panel" aria-label="Camera with YOLO26n detections">
        <header class="mtg-head mono"><span><b>01</b> Camera · YOLO26n</span><span class="mtg-stat" data-k="fps"></span></header>
        <div class="mtg-stage mtg-stage--cam"></div>
      </section>
      <section class="mtg-panel" aria-label="2D LiDAR scan and Angular Sector Fusion">
        <header class="mtg-head mono"><span><b>02</b> LiDAR · ASF</span><span class="mtg-stat">10 Hz scan · ${FUSION.rate} Hz fusion</span></header>
        <div class="mtg-stage mtg-stage--lidar"></div>
      </section>
      <section class="mtg-panel" aria-label="Semantic route planning">
        <header class="mtg-head mono"><span><b>03</b> Semantic route · Nav2 Route Server</span><span class="mtg-stat">penalty-weighted</span></header>
        <div class="mtg-stage mtg-stage--route"></div>
      </section>
      <section class="mtg-panel mtg-panel--telem" aria-label="Telemetry">
        <header class="mtg-head mono"><span><b>04</b> Telemetry · Raspberry Pi 5</span><span class="mtg-stat" data-k="clock"></span></header>
        <div class="mtg-telem">
          <div class="mtg-tile"><span class="mono">YOLO26n · NCNN</span><strong data-k="yfps">5.5</strong><small data-k="yms">167 ms / inference</small></div>
          <div class="mtg-tile"><span class="mono">CPU total</span><strong data-k="cpu">85 %</strong><div class="mtg-cpu" aria-hidden="true"><i class="a"></i><i class="b"></i><i class="c"></i></div><small>Nav2 · YOLO · semantic</small></div>
          <div class="mtg-tile"><span class="mono">ASF fusion</span><strong>${FUSION.rate} Hz</strong><small>&lt; 1 ms / detection</small></div>
          <div class="mtg-tile"><span class="mono">Semantic map</span><strong data-k="objs">0</strong><small data-k="objmix">objects · GeoJSON</small></div>
          <div class="mtg-tile mtg-tile--limit"><span class="mono">Speed limit</span><strong data-k="limit">off</strong><small data-k="limitwhy">AdjustSpeedLimit</small></div>
          <div class="mtg-tile"><span class="mono">Pose · map</span><strong data-k="pose">x 0.00</strong><small data-k="vel">0.00 m/s</small></div>
          <div class="mtg-spark"><div class="mtg-spark__plot" aria-hidden="true"></div><span class="mono"><i class="is-cpu"></i>CPU % <i class="is-fps"></i>YOLO FPS · last 20 s</span></div>
        </div>
      </section>
    </div>
    <div class="mtg-timeline" aria-hidden="true"><div class="mtg-timeline__bar"><i></i></div><span class="mono" data-k="leg"></span></div>`;

  const q = (k) => body.querySelector(`[data-k="${k}"]`);
  const stageCam = body.querySelector('.mtg-stage--cam');
  const stageLidar = body.querySelector('.mtg-stage--lidar');
  const stageRoute = body.querySelector('.mtg-stage--route');
  const bar = body.querySelector('.mtg-timeline__bar');
  const barFill = bar.querySelector('i');

  /* ---------- Shared simulation ---------- */
  const loop = createLoop((t, dt) => frame(START + t, dt));
  const sim = { t: START, map: new SemanticMap(), scan: null, scanTick: -1, fusionTick: -1, flashes: [], events: [], loop: -1, cpu: [], fps: [], cleanup: 0, limited: false };

  const cam = createCameraView(stageCam, {
    sceneAt: (t) => sceneAt(t), compact: true,
    label: 'Robot camera with YOLO26n boxes on a person and corridor furniture.',
    onResize: () => { if (!loop.playing) frame(sim.t, 0); },
  });
  const lidar = createCanvas(stageLidar, {
    label: 'Top-down LiDAR view following the robot: scan points, camera field of view, fusion sectors and the semantic map pins.',
    onResize: () => { if (!loop.playing && sim.scan) drawLidar(sim.t); },
  });
  const sparkView = createCanvas(body.querySelector('.mtg-spark__plot'), { onResize: () => drawSpark() });

  /* ---------- Panel 03: route-replan or placeholder ---------- */
  let route = null, routeDead = false;
  const loadRoute = routeModules['./route-replan.js'];
  let placeholder = null;
  if (loadRoute) {
    loadRoute().then((mod) => {
      if (routeDead) return;
      const host = document.createElement('div');
      host.className = 'mtg-route-host';
      stageRoute.appendChild(host);
      route = mod.default(host, { options: { bare: true, compact: true, theme: options.theme, aspect: 1.6 }, reducedMotion }) || {};
      if (loop.playing) route.play?.();
    }).catch((err) => { console.warn('[sensor-montage] route-replan failed to mount', err); showPlaceholder(); });
  } else showPlaceholder();
  function showPlaceholder() {
    placeholder = createCanvas(stageRoute, { label: 'Nav2 Route Server graph of the FIIR corridor: seven nodes, direct route from node 0 to node 7.', onResize: (s) => drawGraphPlaceholder(placeholder.ctx, s, pal) });
    drawGraphPlaceholder(placeholder.ctx, placeholder.size, pal);
  }

  /* ---------- Simulation step: scan at 10 Hz, ASF at 3 Hz, map + reroute logic ---------- */
  function step(t) {
    const scene = sceneAt(t);
    const k = Math.floor(t / LOOP);
    if (k !== sim.loop) { sim.loop = k; sim.events = []; }
    const scanTick = Math.floor(t * LIDAR.rate);
    if (scanTick !== sim.scanTick) { sim.scanTick = scanTick; sim.scan = scanAt(scene, rng(scanTick)); }
    const fusionTick = Math.floor(t * FUSION.rate);
    if (fusionTick !== sim.fusionTick) {
      sim.fusionTick = fusionTick;
      for (const tr of cam.detector.list()) {
        if (tr.lost) continue;
        const r = asfLocalize(tr.target, sim.scan);
        if (!r.ok) continue;
        sim.flashes.push({ t, r, cls: tr.cls });
        const added = sim.map.observe(t, tr.cls, r.mx, r.my, tr.conf);
        if (added) sim.events.push({ u: t - k * LOOP, kind: added.mobility });
      }
      sim.flashes = sim.flashes.filter((f) => t - f.t < 0.6);
    }
    if (t - sim.cleanup > 10) { sim.cleanup = t; sim.map.cleanup(t); sim.map.objects = sim.map.objects.filter((o) => o.x > scene.robot.x - 25); }
    return scene;
  }


  /* ---------- Panel 02 drawing ---------- */
  const ctk = Object.fromEntries(Object.keys(tk).map((k) => [k, pal.hex(k)]));
  function drawLidar(t) {
    const { ctx, size } = lidar;
    const scene = sceneAt(t), robot = scene.robot;
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, size.w, size.h);
    const span = size.w / size.h > 1.3 ? 7.6 : 5.6;
    const v = makeView({ x: 0, y: 0, w: size.w, h: size.h }, { x0: robot.x - 1.3, x1: robot.x - 1.3 + span, y0: -1.95, y1: 1.95 });
    drawGrid(ctx, v, pal);
    drawWalls(ctx, v, pal);
    const pose = sim.scan.pose;
    ctx.save();
    wedge(ctx, v, pose, -CAM.hfov / 2, CAM.hfov / 2, 6);
    ctx.fillStyle = rgba(pal.paper ? '#17161a' : '#f3eee4', 0.04); ctx.fill();
    ctx.setLineDash([4, 5]); ctx.strokeStyle = pal.lineStrong; ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    const sweep = (t * 2.6) % (Math.PI * 2);
    const ptCol = pal.paper ? pal.hex('orange') : tk.amber;
    if (!reducedMotion) drawSweep(ctx, v, pose, sweep + pose.yaw, ptCol, 4, pal.paper ? 0.1 : 0.13);
    // ASF sectors flash on every 3 Hz fusion tick.
    for (const f of sim.flashes) {
      const a = clamp(1 - (t - f.t) / 0.6), col = classColor(f.cls, ctk);
      ctx.save();
      wedge(ctx, v, sim.scan.pose, f.r.lmin, f.r.lmax, f.r.d + 0.25);
      ctx.fillStyle = rgba(col, 0.22 * a); ctx.fill();
      ctx.strokeStyle = rgba(col, 0.6 * a); ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = col; ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(v.X(f.r.mx), v.Y(f.r.my), 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    drawScan(ctx, v, sim.scan, (i, r, ang) => {
      const rec = ((((sweep - (ang - pose.yaw)) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
      return [rgba(ptCol, reducedMotion ? 0.85 : 1 - 0.55 * rec), 1.8];
    });
    // Semantic map pins (persistent objects), coloured by class, ringed by mobility.
    const f = Math.max(9, Math.min(11, size.w / 52));
    ctx.font = `500 ${f}px "JetBrains Mono Variable", ui-monospace, monospace`; ctx.textBaseline = 'middle';
    const taken = []; // label boxes already drawn, so neighbouring pins do not print over each other
    for (const o of sim.map.objects) {
      if (o.x < v.x0 - 0.5 || o.x > v.x1 + 0.5) continue;
      const X = v.X(o.x), Y = v.Y(o.y), col = classColor(o.cls, ctk), age = clamp((t - o.born) / 0.5);
      ctx.save();
      // A person not re-observed lingers until its 60 s TTL: draw it as a fading, stale entry.
      const stale = o.mobility === 'dynamic' && t - o.last > 1;
      if (stale) ctx.globalAlpha = 0.35;
      if (o.mobility === 'dynamic') { ctx.setLineDash([2, 4]); ctx.strokeStyle = rgba(col, 0.55); ctx.beginPath(); ctx.arc(X, Y, PROXIMITY * v.s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(X, Y, 9 + (1 - age) * 14, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X, Y, 4, 0, Math.PI * 2); ctx.fill();
      if (!compact && size.w > 360) {
        const label = stale ? `${o.cls} · stale (TTL ${MOBILITY.dynamic.ttl} s)` : `${o.cls} · ${o.mobility}`;
        const w = ctx.measureText(label).width, lx = X + 13 + w > size.w - 6 ? X - 13 - w : X + 13, ly = Y - 11;
        if (!taken.some((r) => lx < r[0] + r[2] && lx + w > r[0] && Math.abs(ly - r[1]) < f + 2)) {
          taken.push([lx, ly, w]);
          ctx.fillStyle = pal.fg; ctx.globalAlpha *= 0.85;
          ctx.fillText(label, lx, ly);
        }
      }
      ctx.restore();
    }
    drawRobot(ctx, v, robot, pal, { accent: pal.hex('orange') });
    ctx.fillStyle = pal.mute; ctx.textAlign = 'right';
    ctx.fillText(`/scan · ${LIDAR.rays} rays`, size.w - 10, size.h - 12);
    ctx.textAlign = 'left';
    ctx.fillText('MAP FRAME', 10, 14);
  }

  /* ---------- Panel 04 ---------- */
  function drawSpark() {
    const { ctx, size } = sparkView;
    ctx.clearRect(0, 0, size.w, size.h);
    const n = sim.cpu.length;
    if (n < 2) return;
    const line = (arr, lo, hi, col) => {
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
      arr.forEach((val, i) => { const x = (i / (100 - 1)) * size.w, y = size.h - 4 - ((val - lo) / (hi - lo)) * (size.h - 8); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
    };
    line(sim.cpu, 60, 100, pal.hex('orange'));
    line(sim.fps, 3, 8, pal.hex('cyan'));
  }

  let lastUi = -1;
  function updateTelemetry(t, robot) {
    if (t - lastUi < 0.2 && t >= lastUi) return;
    lastUi = t;
    const d = cam.detector;
    // CPU on a single RPi 5: Nav2 ~55-60 %, YOLO ~10-15 %, semantic pipeline ~5 %, ~85 % in total.
    const nav = 57.5 + noise1(t * 0.7, 1) * 2.5, yolo = 12.5 + noise1(t * 1.3, 2) * 2.2, sem = 4.2 + noise1(t * 2.1, 3) * 1.2;
    const total = clamp(85.3 + noise1(t * 0.9, 4) * 2.4, 78, 92);
    sim.cpu.push(total); sim.fps.push(d.fps);
    while (sim.cpu.length > 100) { sim.cpu.shift(); sim.fps.shift(); }
    q('fps').textContent = `${d.fps.toFixed(1)} FPS`;
    q('yfps').textContent = `${d.fps.toFixed(1)} FPS`;
    q('yms').textContent = `${Math.round(d.ms)} ms / inference`;
    q('cpu').textContent = `${Math.round(total)} %`;
    const bars = body.querySelectorAll('.mtg-cpu i');
    bars[0].style.width = `${nav}%`; bars[1].style.width = `${yolo}%`; bars[2].style.width = `${sem}%`;
    const objs = sim.map.objects;
    const mix = ['static', 'dynamic', 'minor'].map((m) => `${objs.filter((o) => o.mobility === m).length} ${m}`).join(' · ');
    q('objs').textContent = String(objs.length);
    q('objmix').textContent = mix;
    // AdjustSpeedLimit: edges near a dynamic object cap the robot at 30 % of its maximum velocity.
    const limited = robot.speedPct < 100;
    q('limit').textContent = limited ? `${MOBILITY.dynamic.speed} %` : 'off';
    q('limitwhy').textContent = limited ? 'person near route · dynamic' : 'AdjustSpeedLimit · clear';
    if (limited && !sim.limited) {
      const tile = body.querySelector('.mtg-tile--limit');
      tile.classList.remove('is-flash'); void tile.offsetWidth; tile.classList.add('is-flash');
    }
    sim.limited = limited;
    q('pose').textContent = `${(robot.x % BAY).toFixed(2)}, ${robot.y.toFixed(2)}`;
    q('vel').textContent = `${robot.v.toFixed(2)} m/s · yaw ${(robot.yaw / DEG).toFixed(1)}°`;
    const u = t - Math.floor(t / LOOP) * LOOP;
    q('clock').textContent = `t ${u.toFixed(1)} s`;
    q('leg').textContent = `leg ${Math.floor(t / LOOP) + 1} · ${u.toFixed(1)} / ${LOOP.toFixed(1)} s`;
    barFill.style.width = `${(u / LOOP) * 100}%`;
    // Event markers for this leg.
    const marks = sim.events.map((e) => `<b class="is-${e.kind}" style="left:${(e.u / LOOP) * 100}%"></b>`).join('');
    if (bar.dataset.marks !== marks) { bar.querySelectorAll('b').forEach((b) => b.remove()); bar.insertAdjacentHTML('beforeend', marks); bar.dataset.marks = marks; }
    drawSpark();
  }

  /* ---------- Loop ---------- */
  function frame(t, dt) {
    sim.t = t;
    const scene = step(t);
    cam.render(t, dt);
    drawLidar(t);
    updateTelemetry(t, scene.robot);
  }
  if (reducedMotion) {
    // Static but complete: run the simulation silently to a moment with every layer populated.
    const T = 7.5;
    for (let t = START; t < T; t += 1 / 30) { step(t); cam.detector.update(t, 1 / 30); if (Math.round(t * 30) % 6 === 0) updateTelemetry(t, sceneAt(t).robot); }
    frame(T, 0);
  } else frame(START, 0);

  root.classList.add('is-ready');
  return {
    play() { if (reducedMotion) return; loop.play(); route?.play?.(); },
    pause() { loop.pause(); route?.pause?.(); },
    destroy() { routeDead = true; loop.pause(); route?.destroy?.(); cam.destroy(); lidar.destroy(); sparkView.destroy(); placeholder?.destroy(); root.remove(); },
  };
}

