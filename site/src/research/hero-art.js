// Procedural SVG hero scenes for the research pages, one per paper.
//  route:      the paper's 7-node FIIR corridor graph (Table 5 coordinates). A robot takes the direct route,
//              a person is detected near edge 2→7, the edge heats up and the route is recomputed through
//              node 5, as in the reroute of Figure 10.
//  covariance: a waypoint run 1→2→3→4 with EKF uncertainty ellipses; static covariance stays fixed while
//              the learned covariance breathes with the motion regime (illustrative, not measured data).
//  sas:        the six SAS layers as stacked plates; L0–L2 hollow (inherited), L3–L5 filled (this work),
//              with an instruction travelling up and a goal travelling down.
import { gsap, reducedMotion } from '../lib/motion.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  parent?.appendChild(n);
  return n;
};

export function heroArt(container, variant) {
  const svg = el('svg', { class: 'hero-art__svg', viewBox: '0 0 600 600', 'aria-hidden': 'true', preserveAspectRatio: 'xMidYMid meet' });
  container.appendChild(svg);
  const defs = el('defs', {}, svg);
  const grad = el('linearGradient', { id: `fire-${variant}`, x1: '0', y1: '0', x2: '1', y2: '1' }, defs);
  [['0%', '#c1121f'], ['55%', '#fa520f'], ['100%', '#ffb547']].forEach(([o, c]) => el('stop', { offset: o, 'stop-color': c }, grad));
  const glow = el('filter', { id: `glow-${variant}`, x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
  el('feGaussianBlur', { stdDeviation: '6', result: 'b' }, glow);
  const merge = el('feMerge', {}, glow);
  el('feMergeNode', { in: 'b' }, merge);
  el('feMergeNode', { in: 'SourceGraphic' }, merge);

  const tl = ({ route, covariance, sas })[variant]?.(svg, variant);
  // Gentle pointer parallax on the whole scene.
  if (!reducedMotion && window.matchMedia('(hover: hover)').matches) {
    const rx = gsap.quickTo(svg, 'rotationY', { duration: 1.2 });
    const ry = gsap.quickTo(svg, 'rotationX', { duration: 1.2 });
    gsap.set(svg, { transformPerspective: 900 });
    window.addEventListener('pointermove', (e) => {
      rx((e.clientX / window.innerWidth - 0.5) * 10);
      ry(-(e.clientY / window.innerHeight - 0.5) * 8);
    });
  }
  // Pause the loop while the hero is off screen.
  if (tl) {
    new IntersectionObserver(([e]) => (e.isIntersecting ? tl.play() : tl.pause())).observe(container);
  }
  return tl;
}

function route(svg, v) {
  // Table 5 node coordinates (m, map frame).
  const N = { 0: [1.0, 0], 2: [3.4, 0], 3: [2.4, 1.0], 4: [2.4, -0.5], 5: [4.8, 1.0], 6: [4.8, -0.5], 7: [6.7, 0] };
  const names = { 0: 'start', 2: 'center', 3: 'in_top', 4: 'in_bot', 5: 'out_top', 6: 'out_bot', 7: 'goal' };
  const E = [[0, 2], [0, 3], [0, 4], [2, 3], [2, 4], [2, 5], [2, 6], [2, 7], [5, 7], [6, 7]];
  const P = (id) => [60 + ((N[id][0] - 1) / 5.7) * 480, 320 - N[id][1] * 150];
  const g = el('g', {}, svg);
  // Faint occupancy-grid backdrop.
  for (let i = 0; i <= 12; i += 1) {
    el('line', { x1: 30 + i * 45, x2: 30 + i * 45, y1: 120, y2: 480, stroke: 'rgba(243,238,228,0.05)' }, g);
    if (i <= 8) el('line', { x1: 30, x2: 570, y1: 120 + i * 45, y2: 120 + i * 45, stroke: 'rgba(243,238,228,0.05)' }, g);
  }
  const edges = {};
  E.forEach(([a, b]) => {
    const [x1, y1] = P(a);
    const [x2, y2] = P(b);
    edges[`${a}-${b}`] = el('line', { x1, y1, x2, y2, stroke: 'rgba(243,238,228,0.22)', 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
  });
  const routeA = el('path', { d: `M${P(0)}L${P(2)}L${P(7)}`, fill: 'none', stroke: '#5bc0eb', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.9 }, g);
  const routeB = el('path', { d: `M${P(2)}L${P(5)}L${P(7)}`, fill: 'none', stroke: `url(#fire-${v})`, 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', filter: `url(#glow-${v})` }, g);
  Object.keys(N).forEach((id) => {
    const [x, y] = P(id);
    el('circle', { cx: x, cy: y, r: id === '0' || id === '7' ? 11 : 8, fill: '#121214', stroke: id === '0' || id === '7' ? '#7ce0c3' : 'rgba(243,238,228,0.6)', 'stroke-width': 2 }, g);
    const tx = el('text', { x, y: y + (N[id][1] > 0 ? -18 : 26), 'text-anchor': 'middle', fill: 'rgba(243,238,228,0.55)', 'font-family': 'JetBrains Mono Variable, monospace', 'font-size': 11, 'letter-spacing': 1 }, g);
    tx.textContent = `${names[id]} · ${id}`;
  });
  // Detected person near edge 2→7: bounding box + penalty readout.
  const [px, py] = [(P(2)[0] + P(7)[0]) / 2 + 10, P(2)[1] + 32];
  const person = el('g', { opacity: 0 }, g);
  el('rect', { x: px - 18, y: py - 26, width: 36, height: 52, fill: 'none', stroke: '#ff4d5e', 'stroke-width': 2, rx: 3 }, person);
  el('circle', { cx: px, cy: py - 12, r: 6, fill: '#ff4d5e' }, person);
  el('rect', { x: px - 7, y: py - 4, width: 14, height: 22, rx: 4, fill: '#ff4d5e' }, person);
  const tag = el('text', { x: px + 24, y: py - 18, fill: '#ff4d5e', 'font-family': 'JetBrains Mono Variable, monospace', 'font-size': 11 }, person);
  tag.textContent = 'person 0.91 · dynamic';
  const pen = el('text', { x: px + 24, y: py - 2, fill: 'rgba(243,238,228,0.7)', 'font-family': 'JetBrains Mono Variable, monospace', 'font-size': 11 }, person);
  pen.textContent = 'penalty +50 · speed 30%';
  const ring = el('circle', { cx: px, cy: py, r: 10, fill: 'none', stroke: '#ff4d5e', 'stroke-width': 2, opacity: 0 }, g);
  const robot = el('g', {}, g);
  el('rect', { x: -12, y: -9, width: 24, height: 18, rx: 4, fill: '#fa520f' }, robot);
  el('path', { d: 'M12,0 L44,-14 A40,40 0 0 1 44,14 Z', fill: 'rgba(250,82,15,0.18)' }, robot);
  const hud = el('text', { x: 40, y: 560, fill: 'rgba(243,238,228,0.5)', 'font-family': 'JetBrains Mono Variable, monospace', 'font-size': 12, 'letter-spacing': 1 }, svg);
  hud.textContent = 'ROUTE 0 → 2 → 7 · COST 5.7';

  const [x0, y0] = P(0);
  gsap.set(robot, { x: x0, y: y0 });
  if (reducedMotion) {
    gsap.set(person, { opacity: 1 });
    gsap.set(robot, { x: P(5)[0], y: P(5)[1] });
    edges['2-7'].setAttribute('stroke', '#ff4d5e');
    hud.textContent = 'REROUTE · 2 → 5 → 7';
    return null;
  }
  const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.6, defaults: { ease: 'power1.inOut' } });
  tl.set(routeB, { drawSVG: '0%' }).set(routeA, { drawSVG: '0%', opacity: 0.9 }).set(person, { opacity: 0 })
    .set(edges['2-7'], { attr: { stroke: 'rgba(243,238,228,0.22)' } }).set(robot, { x: x0, y: y0 })
    .call(() => (hud.textContent = 'COMPUTE ROUTE · 0 → 2 → 7 · COST 5.7'))
    .to(routeA, { drawSVG: '100%', duration: 1.2, ease: 'power2.inOut' })
    .to(robot, { x: P(2)[0], y: P(2)[1], duration: 2.2 }, '+=0.2')
    .to(person, { opacity: 1, duration: 0.3 }, '-=0.9')
    .fromTo(ring, { attr: { r: 10 }, opacity: 0.9 }, { attr: { r: 60 }, opacity: 0, duration: 1.2, ease: 'power2.out' }, '<')
    .call(() => (hud.textContent = 'PENALTY Δ > δ ON EDGE 2 → 7 · REPLAN'))
    .to(edges['2-7'], { attr: { stroke: '#ff4d5e' }, duration: 0.5 })
    .to(routeA, { opacity: 0.15, duration: 0.4 })
    .to(routeB, { drawSVG: '100%', duration: 1 })
    .call(() => (hud.textContent = 'NEW ROUTE · 2 → 5 → 7'))
    .to(robot, { x: P(5)[0], y: P(5)[1], duration: 1.6 })
    .to(robot, { x: P(7)[0], y: P(7)[1], duration: 1.6 })
    .call(() => (hud.textContent = 'GOAL REACHED · NODE 7'))
    .to({}, { duration: 1.2 });
  return tl;
}

function covariance(svg, v) {
  const pts = [[110, 420], [250, 200], [430, 230], [500, 450]];
  const d = `M${pts[0]} C 140,260 200,190 ${pts[1]} S 400,170 ${pts[2]} S 540,380 ${pts[3]}`;
  const g = el('g', {}, svg);
  for (let i = 0; i < 9; i += 1) el('circle', { cx: 300, cy: 310, r: 40 + i * 40, fill: 'none', stroke: 'rgba(243,238,228,0.04)' }, g);
  const path = el('path', { d, fill: 'none', stroke: 'rgba(243,238,228,0.25)', 'stroke-width': 2, 'stroke-dasharray': '6 6' }, g);
  pts.forEach(([x, y], i) => {
    el('circle', { cx: x, cy: y, r: 13, fill: '#121214', stroke: '#7ce0c3', 'stroke-width': 2 }, g);
    const t = el('text', { x, y: y + 4, 'text-anchor': 'middle', fill: '#7ce0c3', 'font-family': 'JetBrains Mono Variable, monospace', 'font-size': 12 }, g);
    t.textContent = String(i + 1);
  });
  const fixed = el('ellipse', { rx: 46, ry: 30, fill: 'none', stroke: '#5bc0eb', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }, g);
  const learned = el('ellipse', { rx: 30, ry: 18, fill: 'rgba(250,82,15,0.16)', stroke: `url(#fire-${v})`, 'stroke-width': 2.5, filter: `url(#glow-${v})` }, g);
  const dot = el('circle', { r: 6, fill: '#fa520f' }, g);
  const label = el('text', { x: 40, y: 560, fill: 'rgba(243,238,228,0.5)', 'font-family': 'JetBrains Mono Variable, monospace', 'font-size': 12, 'letter-spacing': 1 }, svg);
  label.textContent = 'REGIME · STATIC';
  const legend = el('text', { x: 40, y: 80, fill: 'rgba(243,238,228,0.45)', 'font-family': 'JetBrains Mono Variable, monospace', 'font-size': 11, 'letter-spacing': 1 }, svg);
  legend.textContent = '- - STATIC COVARIANCE   ━ LEARNED COVARIANCE (ILLUSTRATIVE)';
  const follow = [fixed, learned, dot];
  if (reducedMotion) {
    follow.forEach((n) => n.setAttribute('transform', 'translate(250 200)'));
    return null;
  }
  gsap.set(path, { drawSVG: '0%' });
  const state = { p: 0 };
  const len = path.getTotalLength();
  const tl = gsap.timeline({ repeat: -1, yoyo: true, repeatDelay: 0.4 });
  tl.to(path, { drawSVG: '100%', duration: 1.6, ease: 'power2.inOut' }, 0)
    .to(state, {
      p: 1, duration: 7, ease: 'none',
      onUpdate: () => {
        const at = path.getPointAtLength(state.p * len);
        const ahead = path.getPointAtLength(Math.min(len, state.p * len + 2));
        const ang = (Math.atan2(ahead.y - at.y, ahead.x - at.x) * 180) / Math.PI;
        // Turn rate proxy: change of heading drives the learned ellipse, as the regime would.
        const turn = Math.abs(Math.sin(state.p * Math.PI * 3));
        const regime = turn > 0.75 ? 'AGGRESSIVE' : turn > 0.3 ? 'MODERATE' : 'STATIC';
        label.textContent = `REGIME · ${regime}`;
        follow.forEach((n) => n.setAttribute('transform', `translate(${at.x} ${at.y}) rotate(${ang})`));
        learned.setAttribute('rx', 22 + turn * 40);
        learned.setAttribute('ry', 12 + turn * 22);
      },
    }, 0.4);
  return tl;
}

function sas(svg, v) {
  const names = ['Mobile platform', 'Navigation execution', 'Perception + semantic map', 'Semantic reasoning', 'Mission interface', 'Operational memory'];
  const g = el('g', {}, svg);
  const plates = [];
  for (let i = 0; i < 6; i += 1) {
    const y = 470 - i * 66;
    const own = i >= 3;
    const pg = el('g', {}, g);
    el('path', { d: `M300,${y - 44} L520,${y} L300,${y + 44} L80,${y} Z`, fill: own ? 'rgba(250,82,15,0.12)' : 'rgba(18,18,20,0.6)', stroke: own ? `url(#fire-${v})` : 'rgba(243,238,228,0.35)', 'stroke-width': own ? 2.5 : 1.5 }, pg);
    const t = el('text', { x: 540, y: y + 4, fill: own ? '#ffb547' : 'rgba(243,238,228,0.55)', 'font-family': 'JetBrains Mono Variable, monospace', 'font-size': 12, 'letter-spacing': 1 }, pg);
    t.textContent = `L${i}`;
    const n = el('text', { x: 300, y: y + 4, 'text-anchor': 'middle', fill: own ? 'rgba(243,238,228,0.85)' : 'rgba(243,238,228,0.45)', 'font-family': 'Inter Variable, sans-serif', 'font-size': 13 }, pg);
    n.textContent = names[i];
    plates.push(pg);
  }
  const up = el('circle', { cx: 300, cy: 140, r: 7, fill: '#ffb547', filter: `url(#glow-${v})` }, g);
  const down = el('circle', { cx: 300, cy: 470, r: 7, fill: '#5bc0eb', filter: `url(#glow-${v})` }, g);
  const hud = el('text', { x: 40, y: 580, fill: 'rgba(243,238,228,0.5)', 'font-family': 'JetBrains Mono Variable, monospace', 'font-size': 12, 'letter-spacing': 1 }, svg);
  hud.textContent = 'HOLLOW · INHERITED L0–L2   FILLED · L3–L5 THIS WORK';
  if (reducedMotion) return null;
  const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.5 });
  tl.from(plates, { y: (i) => 40 + i * 18, opacity: 0, duration: 1, stagger: 0.12, ease: 'power3.out' })
    .fromTo(up, { attr: { cy: 140 }, opacity: 0 }, { attr: { cy: 272 }, opacity: 1, duration: 1.4, ease: 'power2.inOut' })
    .fromTo(down, { attr: { cy: 272 }, opacity: 0 }, { attr: { cy: 470 }, opacity: 1, duration: 1.4, ease: 'power2.inOut' })
    .to([up, down], { opacity: 0, duration: 0.4 })
    .to(plates, { y: (i) => -i * 6, duration: 1.2, stagger: 0.05, ease: 'sine.inOut', yoyo: true, repeat: 1 });
  return tl;
}
