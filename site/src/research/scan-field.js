// Ambient 2D LiDAR sweep for the research index hero: a robot in a procedurally generated floor plan
// casts rays; hits accumulate as fading points coloured by range, like a 2D scan building a map.
// Plain canvas (no WebGL), DPR-capped, paused offscreen, static under reduced motion.
import { reducedMotion } from '../lib/motion.js';

export function scanField(host) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1, segs = [], robot = { x: 0, y: 0 }, points = [], angle = 0, raf = 0, running = false;

  function plan() {
    // Corridor with rooms, scaled to the viewport; segments are [x1, y1, x2, y2].
    const s = Math.min(w, h * 1.6);
    const cx = w * 0.62, cy = h * 0.5;
    const R = (x, y, ww, hh) => [[x, y, x + ww, y], [x + ww, y, x + ww, y + hh], [x + ww, y + hh, x, y + hh], [x, y + hh, x, y]];
    segs = [
      ...R(cx - s * 0.62, cy - s * 0.1, s * 1.24, s * 0.2),
      ...R(cx - s * 0.5, cy - s * 0.42, s * 0.3, s * 0.26),
      ...R(cx - s * 0.1, cy - s * 0.4, s * 0.34, s * 0.24),
      ...R(cx + s * 0.3, cy - s * 0.36, s * 0.24, s * 0.2),
      ...R(cx - s * 0.42, cy + s * 0.16, s * 0.36, s * 0.24),
      ...R(cx + s * 0.04, cy + s * 0.16, s * 0.26, s * 0.3),
      // furniture-like obstacles
      ...R(cx - s * 0.3, cy - s * 0.04, s * 0.04, s * 0.04),
      ...R(cx + s * 0.18, cy + s * 0.02, s * 0.05, s * 0.05),
    ];
    robot = { x: cx - s * 0.08, y: cy };
  }

  function cast(a) {
    const dx = Math.cos(a), dy = Math.sin(a);
    let best = Infinity;
    for (const [x1, y1, x2, y2] of segs) {
      const ex = x2 - x1, ey = y2 - y1;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-6) continue;
      const t = ((x1 - robot.x) * ey - (y1 - robot.y) * ex) / den;
      const u = ((x1 - robot.x) * dy - (y1 - robot.y) * dx) / den;
      if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
    }
    return best === Infinity ? null : best;
  }

  function color(d) {
    const k = Math.min(1, d / (Math.max(w, h) * 0.6));
    // amber near → orange → red far
    const r = 255 - k * 62, g = Math.round(181 - k * 163), b = Math.round(71 - k * 40);
    return `rgb(${r},${g},${b})`;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = host.clientWidth; h = host.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    plan();
    points = [];
    if (reducedMotion) staticFrame();
  }

  function sweep(n, spread) {
    for (let i = 0; i < n; i += 1) {
      const a = angle + (Math.random() - 0.5) * spread;
      const d = cast(a);
      if (d) points.push({ x: robot.x + Math.cos(a) * d, y: robot.y + Math.sin(a) * d, d, age: 0 });
    }
    if (points.length > 2600) points.splice(0, points.length - 2600);
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    // sweep wedge
    const grad = ctx.createRadialGradient(robot.x, robot.y, 0, robot.x, robot.y, Math.max(w, h) * 0.7);
    grad.addColorStop(0, 'rgba(250,82,15,0.16)');
    grad.addColorStop(1, 'rgba(250,82,15,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(robot.x, robot.y);
    ctx.arc(robot.x, robot.y, Math.max(w, h), angle - 0.35, angle + 0.02);
    ctx.closePath();
    ctx.fill();
    for (const p of points) {
      const a = Math.max(0, 1 - p.age / 900);
      if (!a) continue;
      ctx.globalAlpha = 0.25 + a * 0.75;
      ctx.fillStyle = color(p.d);
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fa520f';
    ctx.beginPath();
    ctx.arc(robot.x, robot.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(250,82,15,0.5)';
    ctx.beginPath();
    ctx.arc(robot.x, robot.y, 14 + Math.sin(angle * 3) * 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  function frame() {
    angle += 0.035;
    sweep(26, 0.3);
    points.forEach((p) => (p.age += 1));
    draw();
    raf = requestAnimationFrame(frame);
  }

  function staticFrame() {
    for (let a = 0; a < Math.PI * 2; a += 0.004) { angle = a; sweep(1, 0); }
    angle = -0.6;
    draw();
  }

  const play = () => { if (!running && !reducedMotion) { running = true; raf = requestAnimationFrame(frame); } };
  const pause = () => { running = false; cancelAnimationFrame(raf); };
  new ResizeObserver(resize).observe(host);
  new IntersectionObserver(([e]) => (e.isIntersecting ? play() : pause())).observe(host);
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : play()));
}
