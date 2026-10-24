// Shared scaffolding for the navigation demos (route-replan, ekf-covariance, lidar-scan):
// the .demo-frame chrome, stage sizing, a DPR-capped 2D canvas, an rAF loop and theme palettes.

import './nav-demos.css';

/** Colours used inside canvases. Mirrors tokens.css so canvas and DOM stay in sync. */
export const PALETTES = {
  dark: {
    bg: '#0e0e10', bg2: '#141417', grid: 'rgba(91,192,235,0.055)', gridMajor: 'rgba(91,192,235,0.11)',
    wall: 'rgba(243,238,228,0.62)', wallFill: 'rgba(243,238,228,0.05)', hatch: 'rgba(243,238,228,0.12)',
    furniture: 'rgba(243,238,228,0.22)', fg: '#f3eee4', dim: 'rgba(243,238,228,0.62)', mute: 'rgba(243,238,228,0.4)',
    line: 'rgba(243,238,228,0.18)', edge: 'rgba(243,238,228,0.26)', node: '#f3eee4', nodeFill: '#141417',
    route: '#5bc0eb', routeCore: '#e8f7ff', routeGlow: 'rgba(91,192,235,0.30)', travelled: 'rgba(124,224,195,0.55)',
    dynamic: '#ff4d5e', static: '#fa520f', minor: '#ffb547', cyan: '#5bc0eb', mint: '#7ce0c3', violet: '#9b8cff',
    red: '#c1121f', orange: '#fa520f', amber: '#ffb547', robot: '#f3eee4', robotBody: '#1f1f23',
    truth: 'rgba(243,238,228,0.55)', blend: 'lighter',
  },
  paper: {
    bg: '#f5f0e6', bg2: '#ece4d4', grid: 'rgba(23,22,26,0.05)', gridMajor: 'rgba(23,22,26,0.1)',
    wall: 'rgba(23,22,26,0.7)', wallFill: 'rgba(23,22,26,0.04)', hatch: 'rgba(23,22,26,0.14)',
    furniture: 'rgba(23,22,26,0.28)', fg: '#17161a', dim: 'rgba(23,22,26,0.7)', mute: 'rgba(23,22,26,0.5)',
    line: 'rgba(23,22,26,0.16)', edge: 'rgba(23,22,26,0.3)', node: '#17161a', nodeFill: '#fffaf0',
    route: '#1673a6', routeCore: '#0b3f5e', routeGlow: 'rgba(22,115,166,0.2)', travelled: 'rgba(22,130,110,0.55)',
    dynamic: '#c1121f', static: '#e0490a', minor: '#b77506', cyan: '#1673a6', mint: '#16826e', violet: '#5a4bd1',
    red: '#c1121f', orange: '#e0490a', amber: '#b77506', robot: '#17161a', robotBody: '#fffaf0',
    truth: 'rgba(23,22,26,0.5)', blend: 'source-over',
  },
};

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
export { el };

/**
 * Builds the demo chrome inside `host` and keeps the stage sized.
 * Sizing rules (shared contract): options.height (px) wins; else if the host already has a height
 * (a sized parent, e.g. sensor-montage) the demo fills it; else height = width / aspect(width).
 *
 * @param {HTMLElement} host
 * @param {object} cfg
 * @param {string} cfg.title          mono title in the bar
 * @param {string} cfg.label          aria-label for the visual
 * @param {object} cfg.options        demo options (bare, compact, theme, height, aspect)
 * @param {(w:number)=>number} cfg.aspect  default aspect ratio for a given width
 * @param {boolean} [cfg.live=true]   show a pulsing "live" chip
 */
export function createShell(host, cfg) {
  const { options = {}, title, label, live = true } = cfg;
  const theme = options.theme === 'paper' ? 'paper' : 'dark';
  const bare = !!options.bare;
  const compact = !!options.compact;
  const fill = !options.height && host.clientHeight > 40;

  const root = el('div', `navd navd--${theme}${bare ? ' navd--bare' : ' demo-frame'}${compact ? ' navd--compact' : ''}${fill ? ' navd--fill' : ''}`);
  let bar = null, legend = null, controls = null;
  if (!bare) {
    bar = el('div', 'demo-frame__bar navd__bar');
    const t = el('div', 'navd__title');
    t.append(el('span', 'mono', title));
    if (live) t.append(el('span', 'navd__live', '<i></i><span class="mono">live</span>'));
    legend = el('div', 'navd__legend');
    controls = el('div', 'navd__controls');
    bar.append(t, legend, controls);
    root.append(bar);
  }
  const stage = el('div', 'navd__stage');
  stage.setAttribute('role', 'img');
  stage.setAttribute('aria-label', label);
  root.append(stage);
  host.append(root);

  const size = () => {
    if (options.height) { stage.style.height = `${options.height}px`; return; }
    if (fill) return; // CSS flex fills the host
    const w = stage.clientWidth || host.clientWidth || 600;
    const a = options.aspect || cfg.aspect(w);
    stage.style.height = `${Math.round(w / a)}px`;
  };
  const ro = new ResizeObserver(size);
  ro.observe(root);
  size();

  return {
    root, bar, legend, controls, stage, theme, bare, compact, palette: PALETTES[theme],
    destroy() { ro.disconnect(); root.remove(); },
  };
}

/** Legend item helper: coloured swatch + mono label. */
export function legendItem(color, text, shape = 'dot') {
  const i = el('span', `navd__key navd__key--${shape}`);
  i.style.setProperty('--c', color);
  i.append(el('i'), el('span', 'mono', text));
  return i;
}

/**
 * Segmented button group with aria-pressed state. Returns { node, set(value) }.
 * @param {{value:string,label:string}[]} items
 */
export function segmented(name, items, value, onChange) {
  const node = el('div', 'navd__seg');
  node.setAttribute('role', 'group');
  node.setAttribute('aria-label', name);
  const buttons = items.map((it) => {
    const b = el('button', 'navd__segbtn mono', it.label);
    b.type = 'button';
    b.dataset.value = it.value;
    b.addEventListener('click', () => { set(it.value); onChange(it.value, true); });
    node.append(b);
    return b;
  });
  function set(v) { buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === v))); }
  set(value);
  return { node, set };
}

/**
 * A 2D canvas filling `parent`, DPR capped at 2, kept in sync with a ResizeObserver.
 * `onResize(w, h)` fires after each size change (CSS pixels).
 */
export function createCanvas(parent, onResize) {
  const canvas = document.createElement('canvas');
  canvas.className = 'navd__canvas';
  parent.append(canvas);
  const ctx = canvas.getContext('2d');
  const s = { canvas, ctx, w: 1, h: 1, dpr: 1 };
  const resize = () => {
    const w = Math.max(1, parent.clientWidth), h = Math.max(1, parent.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === s.w && h === s.h && dpr === s.dpr) return;
    Object.assign(s, { w, h, dpr });
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    onResize?.(w, h);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(parent);
  resize();
  /** Reset the transform to CSS pixels before drawing a frame. */
  s.begin = () => { ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0); return ctx; };
  s.destroy = () => { ro.disconnect(); canvas.remove(); };
  return s;
}

/** requestAnimationFrame loop with play/pause; `tick(dt, t)` gets seconds (dt clamped to 50 ms). */
export function createLoop(tick) {
  let raf = 0, last = 0, running = false;
  const frame = (now) => {
    raf = 0;
    if (!running) return;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    tick(dt, now / 1000);
    raf = requestAnimationFrame(frame);
  };
  return {
    play() { if (running) return; running = true; last = 0; raf = requestAnimationFrame(frame); },
    pause() { running = false; cancelAnimationFrame(raf); raf = 0; },
    get running() { return running; },
  };
}

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInOut = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
/** Overshooting "pop" for detections appearing. */
export const easeBack = (t) => { t = clamp(t); const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

/** Mix two #rrggbb colours, returns rgba() string. */
export function mix(a, b, t, alpha = 1) {
  const pa = hex(a), pb = hex(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * clamp(t)));
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}
export function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function withAlpha(h, a) { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; }

/** Deterministic PRNG so scripted demos replay identically (needed for setProgress scrubbing). */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
