// Offline instruction-to-decision latency for the three arms of the controlled comparison, on a log scale.
// Data: Tables 6 and 7 (standardized context) of Abaza et al., Robotics and Autonomous Systems 207 (2027) 105822.
import { createChart, s, t, log10, tip, introTimeline } from '../research/chart-kit.js';

const ARMS = [
  ['A', 'Complete system', 'M3 Step 0 → Steps 1–6 → VLM on escalation', 'a'],
  ['B', 'M3 disabled', 'Steps 1–6 → VLM on escalation', 'b'],
  ['C', 'Direct VLM', 'every instruction goes to the VLM', 'c'],
];
// Median of per-item three-seed medians (ms), correct items, VLM calls (item-seed observations).
const STRATA = [
  { name: 'Familiar (5)', ms: [0.133, 6948.456, 7054.761], correct: ['5/5', '4/5', '4/5'], calls: ['0/15', '12/15', '15/15'] },
  { name: 'Unseen (27)', ms: [6996.319, 7046.374, 7045.735], correct: ['17/27', '17/27', '17/27'], calls: ['69/81', '69/81', '81/81'] },
  { name: 'Clarification (6)', ms: [9447.636, 9408.325, 9500.059], correct: ['3/6', '3/6', '3/6'], calls: ['18/18', '18/18', '18/18'] },
  { name: 'All items (38)', ms: [6997.017, 7068.484, 7052.699], correct: ['25/38', '24/38', '24/38'], calls: ['87/114', '99/114', '114/114'] },
];
const FOOT = [
  'On the five familiar items the complete system answers from M3 memory: <b>0.133 ms</b> versus ≈7 s, with 0 of 15 VLM calls and 5/5 items agreeing with the stored associations (4/5 for B and C). Paired ratios here reach ≈52,000–53,000×, but only because those paths skip inference.',
  'On formulations not stored in memory, M3 adds nothing: all three arms reach 17/27. The cascade without M3 still saves calls (69 of 81 versus 81 of 81) with identical decisions.',
  'Clarification-required items: no arm improved clarification behaviour (3/6 each). Every clarification was an explicit node_id = −1 response.',
  'Across all 38 items the complete system was only 29 ms faster than direct VLM resolution (C/A = 1.0042). <b>Large savings are confined to inference-avoiding paths; they are not an overall speedup.</b>',
];

export default function mount(el, ctx) {
  return createChart(el, ctx, {
    title: 'Offline decision latency · log scale',
    label: 'Log-scale dot plot of offline decision latency for arms A, B and C. Familiar items: 0.133 ms for the complete system versus about 6,948 and 7,055 ms. All 38 items: about 6,997, 7,068 and 7,053 ms.',
    tabs: STRATA.map((x) => x.name),
    legend: ARMS.map(([id, n, , k]) => [k, `${id} · ${n}`]),
    height: (w, tab, compact) => (compact ? 240 : 280),
    foot: (tab) => FOOT[tab],
    table: (tab) => ({
      caption: `Standardized context, ${STRATA[tab].name}: median of per-item three-seed medians`,
      head: ['Arm', 'Decision latency', 'Correct items', 'VLM calls'],
      rows: ARMS.map(([id, n], i) => [`${id} · ${n}`, `${STRATA[tab].ms[i].toLocaleString('en-US', { maximumFractionDigits: 3 })} ms`, STRATA[tab].correct[i], STRATA[tab].calls[i]]),
    }),
    render({ svg, width, height, tab }) {
      const tl = introTimeline();
      const st = STRATA[tab];
      const narrow = width < 520;
      const left = narrow ? 40 : 190;
      const right = width - 16;
      const top = 16;
      const base = height - 30;
      const x = log10(0.05, 20000, left, right);
      [0.1, 1, 10, 100, 1000, 10000].forEach((v) => {
        s('line', { x1: x(v), x2: x(v), y1: top, y2: base, class: 'rc-grid' }, svg);
        const lbl = v >= 1000 ? `${v / 1000} s` : `${v} ms`;
        t(svg, x(v), base + 18, lbl, { 'text-anchor': 'middle', class: 'rc-num rc-mute' });
      });
      const rowH = (base - top) / 3;
      ARMS.forEach(([id, name, desc, k], i) => {
        const cy = top + rowH * (i + 0.5);
        const v = st.ms[i];
        const g = s('g', {}, svg);
        s('rect', { x: 0, y: cy - rowH / 2 + 2, width, height: rowH - 4, class: 'rc-hover', rx: 6 }, g);
        t(g, 0, cy + (narrow ? -12 : 4), id, { class: 'rc-big', style: 'font-size:22px' });
        if (!narrow) {
          t(g, 26, cy - 2, name, { class: 'rc-ink' });
          t(g, 26, cy + 14, `${st.calls[i]} VLM calls`, { class: 'rc-mono rc-mute' });
        } else {
          t(g, left, cy - 14, `${name} · ${st.calls[i]} VLM calls`, { class: 'rc-mono rc-mute' });
        }
        const stem = s('line', { x1: left, x2: x(v), y1: cy, y2: cy, class: `s-${k}`, 'stroke-width': 2 }, g);
        const dot = s('circle', { cx: x(v), cy, r: 7, class: `f-${k}`, stroke: 'var(--rc-surface)', 'stroke-width': 2 }, g);
        const label = v < 1 ? `${v} ms` : `${(v / 1000).toFixed(2)} s`;
        const lb = t(g, x(v) + (x(v) > right - 70 ? -12 : 12), cy + 4, label, { class: 'rc-num', 'text-anchor': x(v) > right - 70 ? 'end' : 'start' });
        if (x(v) > right - 70) lb.setAttribute('y', cy + 22);
        tip(g, `<span class="mono">${id} · ${name}</span><b>${label}</b> median decision latency<br>${desc}<br>${st.correct[i]} items correct · ${st.calls[i]} VLM calls`);
        tl.from(stem, { attr: { x2: left }, duration: 1.3, ease: 'power3.inOut' }, 0.1 + i * 0.12)
          .from(dot, { attr: { cx: left }, duration: 1.3, ease: 'power3.inOut' }, 0.1 + i * 0.12)
          .from(lb, { opacity: 0, duration: 0.4 }, 1.3 + i * 0.12);
      });
      return tl;
    },
  });
}
