// Controlled L3b model-substitution replay: three VLMs through the unchanged prompt/parser.
// Data: Table 5, Part A of Abaza et al., Robotics and Autonomous Systems 207 (2027) 105822.
import { createChart, s, t, lin, tip, barPath, introTimeline } from '../research/chart-kit.js';

const MODELS = [['qwen3.5:4b', 'control', 'a'], ['gemma4:e2b', 'substitute', 'b'], ['qwen3.5:9b', 'substitute', 'c']];
const METRICS = [
  { tab: 'Parser compliance', unit: '%', max: 100, v: [[181, 204], [204, 204], [199, 204]], note: 'Responses that satisfied the machine-readable contract.' },
  { tab: 'Accepted node', unit: '%', max: 100, v: [[160, 204], [194, 204], [165, 204]], note: 'Outputs that produced an accepted destination node.' },
  { tab: 'Archive agreement', unit: '%', max: 100, v: [[137, 204], [131, 204], [120, 204]], note: 'Agreement with the archived destination: one recorded stochastic outcome, not semantic accuracy.' },
  { tab: 'Seed unanimity', unit: '%', max: 100, v: [[40, 68], [66, 68], [50, 68]], note: 'Records where all three seeds returned the same node (parse failures count as non-unanimous).' },
  { tab: 'Median latency', unit: 's', max: 16, v: [7.2, 6.77, 14.63], note: 'Median wall time on the common replay workstation; 0.94× and 2.01× the control.' },
];

export default function mount(el, ctx) {
  return createChart(el, ctx, {
    title: 'Model substitution · 68 records × 3 models × 3 seeds',
    label: 'Bar chart comparing three VLMs replayed through the unchanged L3b interface: parser compliance 88.7, 100 and 97.5 percent; archived-node agreement 67.2, 64.2 and 58.8 percent; median latency 7.20, 6.77 and 14.63 seconds.',
    tabs: METRICS.map((m) => m.tab),
    legend: MODELS.map(([n, role, k]) => [k, `${n}${role === 'control' ? ' (control)' : ''}`]),
    height: (w, tab, compact) => (compact ? 200 : 230),
    foot: (tab) => `${METRICS[tab].note} All three models ran through the frozen prompt and parser without model-specific changes: <b>interface portability, not semantic model invariance.</b> The cohort only contains records the original system resolved with a retained image.`,
    table: (tab) => ({
      caption: METRICS[tab].tab,
      head: ['Model', 'Value'],
      rows: MODELS.map(([n], i) => {
        const v = METRICS[tab].v[i];
        return [n, Array.isArray(v) ? `${v[0]}/${v[1]} = ${((v[0] / v[1]) * 100).toFixed(1)}%` : `${v} s`];
      }),
    }),
    render({ svg, width, height, tab }) {
      const tl = introTimeline();
      const m = METRICS[tab];
      const narrow = width < 480;
      const left = narrow ? 92 : 130;
      const right = width - 70;
      const top = 8;
      const base = height - 28;
      const x = lin(0, m.max, left, right);
      const ticks = m.unit === '%' ? [0, 25, 50, 75, 100] : [0, 4, 8, 12, 16];
      ticks.forEach((v) => {
        s('line', { x1: x(v), x2: x(v), y1: top, y2: base, class: 'rc-grid' }, svg);
        t(svg, x(v), base + 18, `${v}${v === m.max ? ` ${m.unit}` : ''}`, { 'text-anchor': 'middle', class: 'rc-num rc-mute' });
      });
      const rowH = (base - top) / MODELS.length;
      MODELS.forEach(([name, role, k], i) => {
        const cy = top + rowH * (i + 0.5);
        const raw = m.v[i];
        const val = Array.isArray(raw) ? (raw[0] / raw[1]) * 100 : raw;
        const label = Array.isArray(raw) ? `${val.toFixed(1)}%` : `${raw.toFixed(2)} s`;
        const g = s('g', {}, svg);
        s('rect', { x: 0, y: cy - rowH / 2 + 2, width, height: rowH - 4, class: 'rc-hover', rx: 6 }, g);
        t(g, 0, cy, name, { class: 'rc-ink' });
        t(g, 0, cy + 15, role, { class: 'rc-mono rc-mute' });
        const bar = s('path', { d: barPath(left, cy - 11, x(val) - left, 22), class: `f-${k}` }, g);
        const lb = t(g, x(val) + 8, cy + 4, label, { class: 'rc-num' });
        tip(g, `<span class="mono">${name} · ${m.tab}</span><b>${Array.isArray(raw) ? `${raw[0]}/${raw[1]}` : `${raw} s`}</b> (${label})`);
        tl.from(bar, { scaleX: 0, svgOrigin: `${left} ${cy}`, duration: 1 }, 0.1 + i * 0.12).from(lb, { opacity: 0, duration: 0.4 }, 0.8 + i * 0.12);
      });
      return tl;
    },
  });
}
