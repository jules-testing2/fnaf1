// Shared plumbing for the perception demos (yolo-detect, asf-fusion, sensor-montage):
// design tokens, colour maths, DPR-aware canvases, a pausable rAF clock, seeded noise and the
// `.demo-frame` chrome every demo renders unless `options.bare` is set.


/* ---------- Tokens & colour ---------- */

const TOKEN_NAMES = ['ink', 'ink-2', 'ink-3', 'ink-4', 'paper', 'paper-2', 'paper-3', 'red', 'orange', 'ember', 'amber',
  'gold', 'cyan', 'mint', 'violet', 'danger', 'fg', 'fg-ink'];

/** Reads the design tokens from :root once per mount (fallbacks keep tests and SSR-less previews sane). */
export function readTokens() {
  const css = getComputedStyle(document.documentElement);
  const fallback = {
    ink: '#0a0a0b', 'ink-2': '#121214', 'ink-3': '#1b1b1e', 'ink-4': '#26262a', paper: '#f5f0e6', 'paper-2': '#ece4d4',
    'paper-3': '#e0d6c2', red: '#c1121f', orange: '#fa520f', ember: '#ff7a2f', amber: '#ffb547', gold: '#e8c27a',
    cyan: '#5bc0eb', mint: '#7ce0c3', violet: '#9b8cff', danger: '#ff4d5e', fg: '#f3eee4', 'fg-ink': '#17161a',
  };
  const out = {};
  for (const n of TOKEN_NAMES) out[n] = (css.getPropertyValue(`--${n}`).trim() || fallback[n]);
  return out;
}

export function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Linear blend of two hex colours, returned as an `rgb()` / `rgba()` string. */
export function mix(a, b, t, alpha = 1) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return alpha >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Returns a palette for diagrams: on paper, accents are darkened so they keep contrast on cream. */
export function palette(theme) {
  const tk = readTokens();
  const paper = theme === 'paper';
  const accent = (name) => (paper ? mix(tk[name], tk['fg-ink'], 0.32) : tk[name]);
  const hex = (name) => (paper ? toHex(mix(tk[name], tk['fg-ink'], 0.32)) : tk[name]);
  return {
    tk, paper,
    bg: paper ? tk['paper-2'] : tk['ink-2'],
    fg: paper ? tk['fg-ink'] : tk.fg,
    ink: tk.ink,
    accent, hex,
    // Text and hairlines derived from the theme foreground.
    dim: paper ? 'rgba(23,22,26,0.66)' : 'rgba(243,238,228,0.66)',
    mute: paper ? 'rgba(23,22,26,0.45)' : 'rgba(243,238,228,0.42)',
    line: paper ? 'rgba(23,22,26,0.12)' : 'rgba(243,238,228,0.10)',
    lineStrong: paper ? 'rgba(23,22,26,0.28)' : 'rgba(243,238,228,0.24)',
  };
}

function toHex(rgb) {
  const m = rgb.match(/\d+/g).slice(0, 3).map(Number);
  return '#' + m.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/* ---------- Numbers ---------- */

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const DEG = Math.PI / 180;

/** Deterministic PRNG (mulberry32) so every visitor sees the same "run". */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample from a uniform source (Box-Muller). */
export function gauss(rand) {
  const u = Math.max(1e-9, rand()), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Smooth 1D value noise in [-1, 1], cheap and deterministic, used for jitter that should not flicker. */
export function noise1(x, seed = 0) {
  const h = (n) => { const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u);
}

/* ---------- Canvas ---------- */

/**
 * Creates a canvas that fills `host`, keeps its backing store at devicePixelRatio (capped at 2, and at
 * `maxWidth` backing pixels when given)
 * and calls `onResize({ w, h, dpr })` whenever the host changes size after creation.
 */
export function createCanvas(host, { label, className = '', onResize, maxWidth = Infinity } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = `pcp-canvas ${className}`.trim();
  if (label) { canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', label); }
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const size = { w: 1, h: 1, dpr: 1 };
  let initial = true;
  const fit = () => {
    const r = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2, maxWidth / w);
    if (w === size.w && h === size.h && dpr === size.dpr) return;
    Object.assign(size, { w, h, dpr });
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!initial) onResize?.(size); // the first paint is the caller's job
  };
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  fit();
  initial = false;
  return { canvas, ctx, size, fit, destroy: () => { ro.disconnect(); canvas.remove(); } };
}

/**
 * A pausable animation clock. `tick(t, dt)` receives the demo's own time in seconds, which
 * only advances while playing, so pausing and resuming never makes the simulation jump.
 */
export function createLoop(tick) {
  let raf = 0, last = 0, t = 0, playing = false;
  const frame = (now) => {
    raf = 0;
    if (!playing) return;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    t += dt;
    tick(t, dt);
    raf = requestAnimationFrame(frame);
  };
  return {
    get time() { return t; },
    set time(v) { t = v; },
    get playing() { return playing; },
    play() { if (playing) return; playing = true; last = 0; raf = requestAnimationFrame(frame); },
    pause() { playing = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
  };
}

/* ---------- Chrome ---------- */

/**
 * Builds the demo shell: `.demo-frame` with a mono title bar (unless bare), a body and an optional
 * footer. Theme and compact flags become classes so the CSS can adapt.
 */
export function buildFrame(el, { title, meta = '', options = {}, kind }) {
  const { bare = false, compact = false, theme = 'dark' } = options;
  el.classList.add('pcp-host');
  const root = document.createElement('div');
  root.className = ['pcp', `pcp--${kind}`, bare ? 'pcp--bare' : 'demo-frame', compact && 'pcp--compact',
    theme === 'paper' && 'pcp--paper'].filter(Boolean).join(' ');
  let bar = null, right = null;
  if (!bare) {
    bar = document.createElement('div');
    bar.className = 'demo-frame__bar pcp-bar';
    bar.innerHTML = `<span class="mono pcp-bar__title"><i class="pcp-dot" aria-hidden="true"></i>${title}</span>`;
    right = document.createElement('div');
    right.className = 'pcp-bar__right';
    if (meta) right.innerHTML = `<span class="mono pcp-bar__meta">${meta}</span>`;
    bar.appendChild(right);
    root.appendChild(bar);
  }
  const body = document.createElement('div');
  body.className = 'pcp-body';
  root.appendChild(body);
  el.appendChild(root);
  return { root, bar, right, body };
}

/**
 * Applies the demo's height: `options.height` (px) wins, then `options.aspect`, then the default aspect,
 * which may switch to a taller `smallAspect` on phones (see .pcp-sized in perception.css).
 */
export function applySize(stage, options, defaultAspect, smallAspect = defaultAspect) {
  if (options.height) { stage.style.height = `${options.height}px`; return; }
  stage.classList.add('pcp-sized');
  stage.style.setProperty('--pcp-aspect', String(options.aspect || defaultAspect));
  stage.style.setProperty('--pcp-aspect-sm', String(options.aspect || smallAspect));
}

/** Formats seconds as hh:mm:ss.mmm for HUD clocks. */
export function clock(t) {
  const ms = Math.floor((t % 1) * 1000), s = Math.floor(t) % 60, m = Math.floor(t / 60) % 60, h = Math.floor(t / 3600);
  const p = (v, n = 2) => String(v).padStart(n, '0');
  return `${p(h)}:${p(m)}:${p(s)}.${p(ms, 3)}`;
}
