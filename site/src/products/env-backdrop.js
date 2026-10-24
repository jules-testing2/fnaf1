// Procedural line-art environments behind the Xplorer build switcher: an indoor corridor,
// warehouse racks, outdoor terrain and open field, drawn in perspective on a 2D canvas and
// scrolling slowly toward the viewer as if the robot were driving. Switching crossfades.

import { gsap, reducedMotion } from '../lib/motion.js';

const FG = (a) => `rgba(243,238,228,${a})`;
const ACCENT = { indoor: '91,192,235', warehouse: '255,181,71', outdoor: '124,224,195', field: '250,82,15' };
const ZMAX = 26;

// Cheap smooth pseudo-noise, deterministic so terrain does not flicker between frames.
const noise = (x, z) => Math.sin(x * 1.3 + z * 0.7) * 0.5 + Math.sin(x * 0.6 - z * 1.1 + 1.7) * 0.35 + Math.sin(x * 2.1 + z * 1.9) * 0.15;
const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

export function createEnvBackdrop(canvas, { initial = 'indoor' } = {}) {
  const ctx = canvas.getContext('2d');
  const state = { cur: initial, prev: null, mix: 1, t: 0 };
  let w = 1, h = 1, dpr = 1, raf = 0, playing = false, last = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = canvas.clientWidth || 1; h = canvas.clientHeight || 1;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    draw();
  }

  // Perspective camera: horizon at 46% height, eye 1.2 m above ground.
  const view = () => ({ cx: w / 2, hz: h * 0.46, f: h * 0.95, eye: 1.2 });
  const P = (v, x, y, z) => [v.cx + (x * v.f) / z, v.hz + ((v.eye - y) * v.f) / z];
  const fog = (z) => Math.max(0, Math.min(1, 1.15 - z / ZMAX));

  function line(a, b, color) { ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }

  /** Floor grid: lines toward the vanishing point plus cross lines that scroll with travel. */
  function floor(v, alpha, spacing, xs, travel, color = FG) {
    for (let x = -xs; x <= xs; x += spacing) line(P(v, x, 0, 0.6), P(v, x, 0, ZMAX), color(0.1 * alpha));
    const off = travel % spacing;
    for (let z = spacing - off; z < ZMAX; z += spacing) {
      if (z < 0.6) continue;
      line(P(v, -xs, 0, z), P(v, xs, 0, z), color(0.13 * alpha * fog(z)));
    }
  }

  const ENVS = {
    indoor(v, a, travel) {
      const acc = (k) => `rgba(${ACCENT.indoor},${k})`;
      floor(v, a, 0.8, 3.2, travel);
      // Corridor walls with door frames passing by.
      for (const side of [-1, 1]) {
        const x = 3.2 * side;
        line(P(v, x, 0, 0.6), P(v, x, 0, ZMAX), FG(0.22 * a));
        line(P(v, x, 2.8, 0.6), P(v, x, 2.8, ZMAX), FG(0.14 * a));
        const off = (travel + (side > 0 ? 2.5 : 0)) % 5;
        for (let z = 5 - off; z < ZMAX; z += 5) {
          if (z < 0.8) continue;
          const k = a * fog(z);
          const d = [P(v, x, 0, z), P(v, x, 2.1, z), P(v, x, 2.1, z + 1), P(v, x, 0, z + 1)];
          ctx.strokeStyle = acc(0.5 * k); ctx.beginPath(); d.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.stroke();
        }
      }
      // Ceiling light strips.
      const off = travel % 3;
      for (let z = 3 - off; z < ZMAX; z += 3) if (z > 0.8) line(P(v, -0.6, 2.8, z), P(v, 0.6, 2.8, z), acc(0.55 * a * fog(z)));
    },

    warehouse(v, a, travel) {
      const acc = (k) => `rgba(${ACCENT.warehouse},${k})`;
      floor(v, a, 1.2, 6, travel);
      // Lane markings.
      const dash = travel % 2;
      for (const x of [-1.3, 1.3]) for (let z = 2 - dash; z < ZMAX; z += 2) if (z > 0.7) line(P(v, x, 0, z), P(v, x, 0, z + 0.9), acc(0.7 * a * fog(z)));
      // Pallet racks on both sides: uprights, beams and boxes.
      for (const side of [-1, 1]) {
        const xi = 2.6 * side, xo = 3.8 * side;
        const off = travel % 2.4;
        for (let z = 2.4 - off, i = Math.floor(travel / 2.4); z < ZMAX; z += 2.4, i--) {
          if (z < 0.9) continue;
          const k = a * fog(z);
          line(P(v, xi, 0, z), P(v, xi, 3.4, z), FG(0.3 * k));
          line(P(v, xo, 0, z), P(v, xo, 3.4, z), FG(0.16 * k));
          for (const y of [0.15, 1.2, 2.3, 3.4]) line(P(v, xi, y, z), P(v, xi, y, z + 2.4), acc(0.32 * k));
          for (const [j, y] of [0.15, 1.2, 2.3].entries()) {
            if (hash(i * 7 + j + side * 31) < 0.35) continue;
            const zz = z + 0.4 + hash(i + j) * 0.8, bh = 0.5 + hash(i * 3 + j) * 0.4;
            const q = [P(v, xi, y, zz), P(v, xi, y + bh, zz), P(v, xi, y + bh, zz + 0.9), P(v, xi, y, zz + 0.9)];
            ctx.fillStyle = acc(0.08 * k); ctx.strokeStyle = acc(0.35 * k);
            ctx.beginPath(); q.forEach((p, n) => (n ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.closePath(); ctx.fill(); ctx.stroke();
          }
        }
      }
    },

    outdoor(v, a, travel) {
      const acc = (k) => `rgba(${ACCENT.outdoor},${k})`;
      // Layered hills on the horizon, drifting slowly for parallax.
      for (let layer = 0; layer < 3; layer++) {
        ctx.strokeStyle = acc((0.42 - layer * 0.11) * a); ctx.beginPath();
        for (let i = 0; i <= 64; i++) {
          const x = (i / 64) * w;
          const y = v.hz - (18 + layer * 16) - noise(i * 0.22 + layer * 9 + travel * 0.01 * (3 - layer), layer) * (14 + layer * 10);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      line([0, v.hz], [w, v.hz], FG(0.2 * a));
      // Gravel: deterministic dots per ground cell.
      const cell = 0.9, off = travel % cell, base = Math.floor(travel / cell);
      for (let zi = 0; zi < ZMAX / cell; zi++) {
        const z = (zi + 1) * cell - off;
        if (z < 0.7) continue;
        for (let xi = -9; xi <= 9; xi++) {
          const r = hash((zi + base) * 41 + xi * 7);
          if (r < 0.45) continue;
          const [px, py] = P(v, xi * 0.7 + r * 0.5, 0, z);
          ctx.fillStyle = FG(0.35 * a * fog(z) * r);
          const s = Math.max(0.6, 2.6 / z);
          ctx.fillRect(px, py, s, s);
        }
      }
      // A perimeter fence on the left.
      const fo = travel % 3;
      let prev = null;
      for (let z = 3 - fo; z < ZMAX; z += 3) {
        if (z < 0.8) continue;
        const b = P(v, -3.4, 0, z), t = P(v, -3.4, 1.4, z);
        line(b, t, acc(0.5 * a * fog(z)));
        if (prev) line(prev, t, acc(0.25 * a * fog(z)));
        prev = t;
      }
    },

    field(v, a, travel) {
      const acc = (k) => `rgba(${ACCENT.field},${k})`;
      // Stars and a distant ridge line.
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = FG(0.35 * a * hash(i + 3));
        ctx.fillRect(hash(i) * w, hash(i + 99) * v.hz * 0.8, 1.2, 1.2);
      }
      ctx.strokeStyle = acc(0.5 * a); ctx.beginPath();
      for (let i = 0; i <= 80; i++) {
        const x = (i / 80) * w;
        const y = v.hz - 30 - Math.abs(noise(i * 0.15, 4)) * 60;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      // Wireframe heightfield rolling toward the camera.
      const sp = 0.8, off = travel % sp, base = Math.floor(travel / sp);
      for (let zi = 0; zi < ZMAX / sp; zi++) {
        const z = (zi + 1) * sp - off;
        if (z < 0.8) continue;
        ctx.strokeStyle = acc(0.45 * a * fog(z)); ctx.beginPath();
        for (let xi = -16; xi <= 16; xi++) {
          const x = xi * 0.6;
          const y = 0.45 * noise(x * 0.5, (zi + base) * sp * 0.45) + 0.25;
          const p = P(v, x, y, z);
          xi > -16 ? ctx.lineTo(...p) : ctx.moveTo(...p);
        }
        ctx.stroke();
      }
    },
  };

  function draw() {
    const v = view();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;
    const travel = state.t * 1.4;
    if (state.prev && state.mix < 1) ENVS[state.prev](v, 1 - state.mix, travel);
    ENVS[state.cur](v, state.mix, travel);
  }

  function loop(now) {
    raf = 0;
    if (!playing) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    state.t += dt;
    draw();
    raf = requestAnimationFrame(loop);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const api = {
    set(env) {
      if (env === state.cur) return;
      state.prev = state.cur; state.cur = env; state.mix = 0;
      gsap.to(state, { mix: 1, duration: reducedMotion ? 0 : 1.1, ease: 'power2.inOut', onUpdate: () => !playing && draw(), onComplete: draw });
    },
    play() { if (reducedMotion || playing) return; playing = true; last = performance.now(); raf = requestAnimationFrame(loop); },
    pause() { playing = false; cancelAnimationFrame(raf); raf = 0; },
    destroy() { api.pause(); ro.disconnect(); io.disconnect(); },
  };
  const io = new IntersectionObserver(([e]) => (e.isIntersecting ? api.play() : api.pause()));
  io.observe(canvas);
  return api;
}
