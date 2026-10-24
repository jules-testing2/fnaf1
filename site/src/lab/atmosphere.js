// Leadership page atmosphere: a fixed background layer whose colour and particle "material" follow the
// reader through the three strata.
//
// Sections declare what the sky should look like while they are on screen:
//   data-sky="#171512"   background colour          data-sky-fg="#efe7d8"   text colour for interludes
//   data-mode="0|1|2"    particle material: 0 stone dust (Magnum), 1 embers (Lumen), 2 fluttering specks (Novum)
// Each section holds its look for its whole height; the gaps between sections (interludes) blend from one
// look to the next, so the morph is scrubbed by scroll.

import { gsap, ScrollTrigger, reducedMotion, isTouch } from '../lib/motion.js';

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a + (b - a) * t;
const mixRgb = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
const rgbCss = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// Particle materials. Speeds are px per frame at 60 fps; sway is horizontal oscillation amplitude.
const MATERIALS = [
  { vx: 0.06, vy: 0.16, sway: 0.12, size: [0.7, 1.9], alpha: 0.42, colors: ['#bdb4a3', '#8c857a', '#d9d0bf', '#6f6a60'] }, // stone dust, slowly settling
  { vx: 0.0, vy: -0.62, sway: 0.45, size: [0.8, 2.3], alpha: 0.95, colors: ['#ffb547', '#fa520f', '#ff7a2f', '#ffd38a'] }, // embers, rising
  { vx: 0.18, vy: -0.26, sway: 1.25, size: [1.6, 3.4], alpha: 0.75, colors: ['#3f6f6a', '#b4532a', '#c08a2b', '#6b7256', '#7d5f8c'] }, // specks, fluttering
].map((m) => ({ ...m, rgb: m.colors.map(hexToRgb) }));

/** A soft radial sprite used for ember glow (drawn once, reused). */
function glowSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,170,70,0.55)');
  grad.addColorStop(0.4, 'rgba(250,82,15,0.18)');
  grad.addColorStop(1, 'rgba(250,82,15,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

export function initAtmosphere(root = document) {
  const sky = root.querySelector('.lab-sky');
  const canvas = sky?.querySelector('canvas');
  const sections = [...root.querySelectorAll('[data-sky]')];
  if (!sky || !canvas || !sections.length) return;

  const ctx = canvas.getContext('2d');
  const glow = glowSprite();
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let w = 0, h = 0;
  let particles = [];
  let mode = 0; // continuous 0..2
  let stops = [];
  let running = false;

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(150, (w * h) / (isTouch ? 9000 : 7500)));
    particles = Array.from({ length: count }, (_, i) => particles[i] || {
      x: Math.random() * w, y: Math.random() * h,
      s: Math.random(), // size seed
      v: 0.5 + Math.random(), // speed seed
      ph: Math.random() * Math.PI * 2, // sway phase
      f: 0.6 + Math.random() * 1.2, // sway frequency
      c: Math.floor(Math.random() * 60), // colour seed
    });
    particles.forEach((p) => { p.x = Math.min(p.x, w); p.y = Math.min(p.y, h); });
    if (!running) draw(performance.now(), 0);
  }

  // Scroll stops: each data-sky section holds its look from its top to its bottom edge.
  function measure() {
    const y0 = window.scrollY;
    stops = sections.flatMap((el) => {
      const r = el.getBoundingClientRect();
      const look = { bg: hexToRgb(el.dataset.sky), fg: hexToRgb(el.dataset.skyFg || '#f3eee4'), mode: Number(el.dataset.mode) || 0 };
      return [{ y: r.top + y0, ...look }, { y: r.bottom + y0, ...look }];
    });
  }

  function lookAt(scrollY) {
    const y = scrollY + h * 0.55; // the reading line, a little below centre
    const first = stops[0], last = stops[stops.length - 1];
    if (y <= first.y) return first;
    if (y >= last.y) return last;
    let i = 0;
    while (y > stops[i + 1].y) i++;
    const a = stops[i], b = stops[i + 1];
    const t = b.y === a.y ? 0 : gsap.utils.clamp(0, 1, (y - a.y) / (b.y - a.y));
    const e = t * t * (3 - 2 * t); // smoothstep: morphs ease in and out of each interlude
    return { bg: mixRgb(a.bg, b.bg, e), fg: mixRgb(a.fg, b.fg, e), mode: mix(a.mode, b.mode, e) };
  }

  function onScroll(scrollY) {
    if (!stops.length) return;
    const look = lookAt(scrollY);
    sky.style.backgroundColor = rgbCss(look.bg);
    document.documentElement.style.setProperty('--sky-fg', rgbCss(look.fg));
    mode = look.mode;
    if (reducedMotion) draw(performance.now(), 0);
  }

  function draw(now, dt) {
    const t = now / 1000;
    const k = dt / 16.67; // frame-rate independent motion
    const w0 = Math.max(0, 1 - Math.abs(mode - 0));
    const w1 = Math.max(0, 1 - Math.abs(mode - 1));
    const w2 = Math.max(0, 1 - Math.abs(mode - 2));
    const W = [w0, w1, w2];
    const blend = (key) => MATERIALS.reduce((s, m, i) => s + m[key] * W[i], 0);
    const vx = blend('vx'), vy = blend('vy'), sway = blend('sway'), alpha = blend('alpha');
    ctx.clearRect(0, 0, w, h);

    for (const p of particles) {
      if (k) {
        p.x += (vx + Math.sin(t * p.f + p.ph) * sway) * p.v * k;
        p.y += vy * p.v * k;
        if (p.y < -12) { p.y = h + 12; p.x = Math.random() * w; }
        if (p.y > h + 12) { p.y = -12; p.x = Math.random() * w; }
        if (p.x < -12) p.x = w + 12;
        if (p.x > w + 12) p.x = -12;
      }
      // colour and size are a weighted blend of the three materials
      const col = [0, 0, 0];
      let size = 0;
      MATERIALS.forEach((m, i) => {
        if (!W[i]) return;
        const c = m.rgb[p.c % m.rgb.length];
        col[0] += c[0] * W[i]; col[1] += c[1] * W[i]; col[2] += c[2] * W[i];
        size += mix(m.size[0], m.size[1], p.s) * W[i];
      });
      const flicker = 0.65 + 0.35 * Math.sin(t * 9 * p.f + p.ph * 3);
      const a = alpha * (w1 ? mix(1, flicker, w1) : 1) * (0.55 + p.s * 0.45);

      if (w1 > 0.02) {
        const g = size * 7;
        ctx.globalAlpha = w1 * flicker * 0.8;
        ctx.drawImage(glow, p.x - g, p.y - g, g * 2, g * 2);
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = rgbCss(col);
      ctx.beginPath();
      // specks flap: their width pulses like a pair of wings seen edge-on
      const flap = w2 ? mix(1, 0.25 + 0.75 * Math.abs(Math.sin(t * 7 * p.f + p.ph)), w2) : 1;
      ctx.ellipse(p.x, p.y, size * flap, size, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const tick = (_, dt) => draw(performance.now(), Math.min(dt, 50));
  let inView = true;
  const update = () => {
    const on = !reducedMotion && inView && !document.hidden;
    if (on === running) return;
    running = on;
    on ? gsap.ticker.add(tick) : gsap.ticker.remove(tick);
  };

  resize();
  measure();
  onScroll(window.scrollY);
  ScrollTrigger.addEventListener('refresh', () => { measure(); onScroll(window.scrollY); });
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (self) => onScroll(self.scroll()) });
  // Animate only while the page body (not the footer) fills the screen.
  ScrollTrigger.create({ trigger: root.querySelector('.lab') || document.body, start: 'top bottom', end: 'bottom top', onToggle: (s) => { inView = s.isActive; update(); } });
  update();
  document.addEventListener('visibilitychange', update);

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 150); });
}
