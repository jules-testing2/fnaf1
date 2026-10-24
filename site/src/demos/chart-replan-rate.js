// Success rates and replanning frequency across the 115 navigation legs.
// Data: Sections 5.2.2 and 5.3, Figure 11 of Abaza et al., Sensors 2026, 26, 2232.
import { createChart, s, t, lin, tip, barPath, introTimeline, gsap } from '../research/chart-kit.js';

const SUCCESS = [
  ['Baseline', 45, 45, 'b'],
  ['Adaptive', 66, 70, 'a'],
  ['Overall', 111, 115, 'c'],
];
const REROUTE = [['Xplorer-A', 13, 22], ['Xplorer-B', 17, 34], ['Xplorer-C', 10, 14]];

export default function mount(el, ctx) {
  return createChart(el, ctx, {
    title: 'Success and replanning · 115 legs, 3 robots',
    label: 'Ring charts of success: baseline 45 of 45, adaptive 66 of 70, overall 111 of 115. Bars of legs with at least one reroute: Xplorer-A 13 of 22, Xplorer-B 17 of 34, Xplorer-C 10 of 14.',
    height: (w) => (w < 600 ? 470 : 280),
    foot: 'All four adaptive failures happened on Xplorer-B: three from AMCL drift, one from the path-gap issue before its interpolation fix. None came from the semantic pipeline or the Route Server. 42 reroute events over 40 of 70 adaptive legs.',
    table: () => ({
      head: ['Group', 'Count', 'Rate'],
      rows: [
        ...SUCCESS.map(([g, a, b]) => [`${g} success`, `${a}/${b}`, `${Math.round((a / b) * 100)}%`]),
        ...REROUTE.map(([r, a, b]) => [`${r} legs with reroute`, `${a}/${b}`, `${Math.round((a / b) * 100)}%`]),
      ],
    }),
    render({ svg, width, height }) {
      const tl = introTimeline();
      const stacked = width < 600;
      const ringsW = stacked ? width : width * 0.46;
      const ringR = Math.min(52, (ringsW / 3) * 0.36);
      t(svg, 0, 14, 'Validated success', { class: 'rc-mono rc-mute' });
      SUCCESS.forEach(([name, a, b, k], i) => {
        const cx = (ringsW / 3) * (i + 0.5);
        const cy = 34 + ringR + 8;
        const C = 2 * Math.PI * ringR;
        const g = s('g', {}, svg);
        s('circle', { cx, cy, r: ringR, fill: 'none', stroke: 'var(--rc-track)', 'stroke-width': 10 }, g);
        const arc = s('circle', { cx, cy, r: ringR, fill: 'none', class: `s-${k}`, 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-dasharray': `${C * (a / b)} ${C}`, transform: `rotate(-90 ${cx} ${cy})` }, g);
        const pct = t(g, cx, cy + 9, `${Math.round((a / b) * 100)}%`, { 'text-anchor': 'middle', class: 'rc-big' });
        t(g, cx, cy + ringR + 24, name, { 'text-anchor': 'middle', class: 'rc-ink' });
        t(g, cx, cy + ringR + 40, `${a}/${b} legs`, { 'text-anchor': 'middle', class: 'rc-num rc-mute' });
        tip(g, `<span class="mono">${name}</span><b>${a} of ${b}</b> legs validated as success`);
        const counter = { v: 0 };
        tl.from(arc, { attr: { 'stroke-dasharray': `0 ${C}` }, duration: 1.4, ease: 'power3.inOut' }, 0.1 + i * 0.15)
          .fromTo(counter, { v: 0 }, { v: (a / b) * 100, duration: 1.4, ease: 'power3.inOut', onUpdate: () => (pct.textContent = `${Math.round(counter.v)}%`) }, 0.1 + i * 0.15);
      });

      const ox = stacked ? 0 : width * 0.54;
      const oy = stacked ? 34 + ringR * 2 + 80 : 0;
      const bw = width - ox;
      const left = ox + (bw < 420 ? 74 : 96);
      const right = width - 54;
      const x = lin(0, 100, left, right);
      t(svg, ox, oy + 14, 'Adaptive legs with ≥ 1 reroute', { class: 'rc-mono rc-mute' });
      const rowsTop = oy + 34;
      const rowH = 44;
      [0, 50, 100].forEach((v) => {
        s('line', { x1: x(v), x2: x(v), y1: rowsTop - 6, y2: rowsTop + rowH * 3, class: 'rc-grid' }, svg);
        t(svg, x(v), rowsTop + rowH * 3 + 16, `${v}%`, { 'text-anchor': 'middle', class: 'rc-num rc-mute' });
      });
      REROUTE.forEach(([robot, a, b], i) => {
        const cy = rowsTop + rowH * (i + 0.5);
        const g = s('g', {}, svg);
        s('rect', { x: ox, y: cy - rowH / 2 + 3, width: bw, height: rowH - 6, class: 'rc-hover', rx: 6 }, g);
        t(g, ox, cy + 4, bw < 420 ? robot.replace('Xplorer-', 'X-') : robot, { class: 'rc-ink' });
        s('path', { d: barPath(left, cy - 9, right - left, 18), class: 'rc-track' }, g);
        const bar = s('path', { d: barPath(left, cy - 9, x((a / b) * 100) - left, 18), class: 'f-d' }, g);
        const lbl = t(g, x((a / b) * 100) + 8, cy + 4, `${Math.round((a / b) * 100)}%`, { class: 'rc-num' });
        t(g, right + 50, cy + 4, `${a}/${b}`, { 'text-anchor': 'end', class: 'rc-num rc-mute' });
        tip(g, `<span class="mono">${robot}</span><b>${a} of ${b}</b> adaptive legs replanned at least once`);
        tl.from(bar, { scaleX: 0, svgOrigin: `${left} ${cy}`, duration: 1.1 }, 0.4 + i * 0.12).from(lbl, { opacity: 0, duration: 0.4 }, 1.1 + i * 0.12);
      });
      gsap.set(svg, { overflow: 'visible' });
      return tl;
    },
  });
}
