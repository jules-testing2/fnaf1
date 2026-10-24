// First-resolving step of the deterministic-first cascade over Session E.
// Data: Section 7.1 and Fig. 5(a) of Abaza et al., Robotics and Autonomous Systems 207 (2027) 105822.
import { createChart, s, t, lin, tip, barPath, introTimeline } from '../research/chart-kit.js';

const STEPS = [
  ['0', 'M3 association', 39, 'Step 0 reuses a promoted instruction–node association (Jaccard ≥ 0.75, margin 0.10)'],
  ['1', 'node ID', 18, 'Step 1: explicit numeric graph-node identifier'],
  ['2', 'node name', 17, 'Step 2: unique normalised node-name match'],
  ['3', 'object ID', 8, 'Step 3: unique semantic-object identifier'],
  ['4', 'attribute', 13, 'Step 4: unique best lexical attribute match'],
  ['5', 'single class', 3, 'Step 5: one mentioned class with one candidate object'],
  ['6', 'class + proximity', 14, 'Step 6: one class, several objects, nearest to the current pose'],
];
const L3B = 104;

export default function mount(el, ctx) {
  return createChart(el, ctx, {
    title: 'Session E · which step resolved each cycle',
    label: 'Bar chart of 216 Session E decision cycles: 112 resolved deterministically (Step 0: 39, Step 1: 18, Step 2: 17, Step 3: 8, Step 4: 13, Step 5: 3, Step 6: 14) and 104 escalated to the VLM path.',
    legend: [['a', 'Deterministic L3a'], ['hatch', 'Escalated to L3b (VLM)']],
    height: (w, tab, compact) => (compact ? 300 : 360),
    foot: '<b>112 of 216</b> start-gate-excluded cycles (51.9%) resolved without a model call; median resolver compute <b>0.245 ms</b>, maximum 0.960 ms, all below 1 ms. The pre-navigation image is acquired before that timer starts, so this is resolver computation, not end-to-end latency. The share reflects the block mix the campaign was built to test, not a general fast-path rate.',
    table: () => ({ head: ['First resolving step', 'Cycles'], rows: [...STEPS.map(([n, name, v]) => [`Step ${n} · ${name}`, v]), ['L3b escalation', L3B], ['Total (E0 excluded)', 216]] }),
    render({ svg, width, height }) {
      const tl = introTimeline();
      const narrow = width < 480;
      const left = narrow ? 118 : 150;
      const right = width - 40;
      const top = 10;
      const base = height - 26;
      const x = lin(0, 110, left, right);
      const rows = STEPS.length + 1;
      const rowH = (base - top) / rows;
      [0, 25, 50, 75, 100].forEach((v) => {
        s('line', { x1: x(v), x2: x(v), y1: top, y2: base, class: 'rc-grid' }, svg);
        t(svg, x(v), base + 18, String(v), { 'text-anchor': 'middle', class: 'rc-num rc-mute' });
      });
      const pat = s('pattern', { id: `hatch-${Math.random().toString(36).slice(2, 7)}`, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, s('defs', {}, svg));
      s('rect', { width: 2.4, height: 6, class: 'f-a' }, pat);
      STEPS.forEach(([n, name, v, help], i) => {
        const cy = top + rowH * (i + 0.5);
        const g = s('g', {}, svg);
        s('rect', { x: 0, y: cy - rowH / 2 + 1, width, height: rowH - 2, class: 'rc-hover', rx: 5 }, g);
        t(g, 0, cy + 4, n, { class: 'rc-num rc-mute' });
        t(g, 16, cy + 4, name, { class: 'rc-ink' });
        const bar = s('path', { d: barPath(left, cy - rowH * 0.3, x(v) - left, rowH * 0.6), class: 'f-a' }, g);
        const lb = t(g, x(v) + 6, cy + 4, String(v), { class: 'rc-num' });
        tip(g, `<span class="mono">Step ${n}</span><b>${v} cycles</b><br>${help}`);
        tl.from(bar, { scaleX: 0, svgOrigin: `${left} ${cy}`, duration: 0.9 }, 0.08 * i).from(lb, { opacity: 0, duration: 0.3 }, 0.6 + 0.08 * i);
      });
      const cy = top + rowH * (rows - 0.5);
      const g = s('g', {}, svg);
      s('rect', { x: 0, y: cy - rowH / 2 + 1, width, height: rowH - 2, class: 'rc-hover', rx: 5 }, g);
      t(g, 0, cy + 4, 'L3b escalation', { class: 'rc-ink', 'font-weight': 600 });
      const hb = s('path', { d: barPath(left, cy - rowH * 0.3, x(L3B) - left, rowH * 0.6), fill: `url(#${pat.id})`, class: 's-a', 'stroke-width': 1.5 }, g);
      const hl = t(g, x(L3B) + 6, cy + 4, String(L3B), { class: 'rc-num' });
      tip(g, '<span class="mono">Escalated</span><b>104 cycles</b> entered the VLM path: unresolved, negated or location-conflicting instructions');
      s('line', { x1: 0, x2: width, y1: cy - rowH / 2, y2: cy - rowH / 2, class: 'rc-axis', 'stroke-dasharray': '3 4' }, svg);
      tl.from(hb, { scaleX: 0, svgOrigin: `${left} ${cy}`, duration: 1.2, ease: 'power2.inOut' }, 0.7).from(hl, { opacity: 0, duration: 0.3 }, 1.6);
      return tl;
    },
  });
}
