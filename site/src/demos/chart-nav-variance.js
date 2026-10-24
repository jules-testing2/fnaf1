// Navigation-time spread, baseline (Nav2 NavigateToPose) vs adaptive (semantic Route Server).
// Data: Tables 8 and 9 of Abaza et al., Sensors 2026, 26, 2232 (validated runs, mean ± SD, n).
import { createChart, s, t, lin, tip, introTimeline } from '../research/chart-kit.js';

const FORWARD = [
  ['Xplorer-A', 45.0, 23.5, 5, 33.1, 8.6, 11],
  ['Xplorer-B', 35.9, 39.5, 10, 33.3, 13.9, 15],
  ['Xplorer-C', 34.2, 25.7, 8, 29.7, 8.0, 7],
  ['All robots', 37.3, 31.1, 23, 32.5, 11.0, 33],
];
const RETURN = [
  ['Xplorer-A', 35.0, 17.3, 5, 37.7, 12.6, 11],
  ['Xplorer-B', 39.9, 24.5, 9, 29.9, 12.1, 15],
  ['Xplorer-C', 35.8, 6.7, 8, 33.3, 13.0, 7],
  ['All robots', 36.9, 17.5, 22, 33.2, 12.4, 33],
];
const DATA = [FORWARD, RETURN];
const XMAX = 150;

export default function mount(el, ctx) {
  return createChart(el, ctx, {
    title: 'Navigation time · mean ± σ',
    label: 'Range chart of navigation time per robot. Forward legs: baseline 37.3 ± 31.1 s versus adaptive 32.5 ± 11.0 s across all robots, with baseline outliers at 97.4 and 142.0 seconds caused by AMCL recovery stalls.',
    tabs: ['Forward legs', 'Return legs'],
    legend: [['b', 'Baseline · Nav2 free-space'], ['a', 'Adaptive · semantic routes']],
    height: (w, tab, compact) => (compact ? 250 : 330),
    foot: (tab) => (tab === 0
      ? '<b>σ 31.1 s → 11.0 s</b>, variance ratio 7.92. Means do not differ significantly (Mann–Whitney U = 294, p = 0.157); dispersion does, marginally (Levene W = 3.14, p = 0.082). Validated runs, Table 8.'
      : 'Return legs reuse the semantic map from the forward prescan. Spread shrinks again (σ 17.5 s → 12.4 s). Validated runs, Table 9.'),
    table: (tab) => ({
      caption: tab === 0 ? 'Forward legs (Table 8)' : 'Return legs (Table 9)',
      head: ['Robot', 'Baseline (s)', 'n', 'Adaptive (s)', 'n'],
      rows: DATA[tab].map(([r, bm, bs, bn, am, as, an]) => [r, `${bm.toFixed(1)} ± ${bs.toFixed(1)}`, bn, `${am.toFixed(1)} ± ${as.toFixed(1)}`, an]),
    }),
    render({ svg, width, height, tab }) {
      const rows = DATA[tab];
      const narrow = width < 520;
      const left = narrow ? 78 : 118;
      const right = width - 18;
      const top = 18;
      const axisY = height - 30;
      const x = lin(0, XMAX, left, right);
      const groupH = (axisY - top) / rows.length;
      const tl = introTimeline();

      for (let v = 0; v <= XMAX; v += 25) {
        s('line', { x1: x(v), x2: x(v), y1: top - 6, y2: axisY, class: 'rc-grid' }, svg);
        t(svg, x(v), axisY + 18, v === XMAX ? `${v} s` : String(v), { 'text-anchor': 'middle', class: 'rc-num rc-mute' });
      }
      s('line', { x1: left, x2: right, y1: axisY, y2: axisY, class: 'rc-axis' }, svg);

      rows.forEach(([robot, bm, bs, bn, am, as, an], gi) => {
        const gy = top + gi * groupH;
        const all = gi === rows.length - 1;
        t(svg, 0, gy + groupH / 2 + 4, narrow ? robot.replace('Xplorer-', 'X-') : robot, { class: all ? 'rc-ink' : '', 'font-weight': all ? 600 : 400 });
        [['b', bm, bs, bn, 'Baseline'], ['a', am, as, an, 'Adaptive']].forEach(([k, m, sd, n, name], ri) => {
          const cy = gy + groupH * (ri === 0 ? 0.32 : 0.68);
          const g = s('g', {}, svg);
          s('rect', { x: left, y: cy - 11, width: right - left, height: 22, class: 'rc-hover', rx: 6 }, g);
          const x0 = x(Math.max(0, m - sd));
          const band = s('rect', { x: x0, y: cy - 4, width: x(m + sd) - x0, height: 8, rx: 4, class: `f-${k}`, opacity: 0.38 }, g);
          const dot = s('circle', { cx: x(m), cy, r: 5.5, class: `f-${k}`, stroke: 'var(--rc-surface)', 'stroke-width': 2 }, g);
          tip(g, `<span class="mono">${robot} · ${name}</span><b>${m.toFixed(1)} ± ${sd.toFixed(1)} s</b> · n = ${n}`);
          tl.from(band, { scaleX: 0, svgOrigin: `${x(m)} ${cy}`, duration: 1.1 }, 0.1 + gi * 0.12 + ri * 0.05)
            .from(dot, { scale: 0, svgOrigin: `${x(m)} ${cy}`, duration: 0.6, ease: 'back.out(2.5)' }, 0.05 + gi * 0.12 + ri * 0.05);
          if (all) {
            const lbl = t(svg, x(m + sd) + 8, cy + 4, `${m.toFixed(1)} ± ${sd.toFixed(1)} s`, { class: 'rc-num' });
            if (x(m + sd) + 110 > right) { lbl.setAttribute('x', x(Math.max(0, m - sd)) - 8); lbl.setAttribute('text-anchor', 'end'); }
            tl.from(lbl, { opacity: 0, duration: 0.6 }, 0.9);
          }
        });
        if (all && tab === 0) {
          // Medians and the two AMCL-stall outliers, as reported in Section 5.2.
          const cyB = gy + groupH * 0.32;
          const cyA = gy + groupH * 0.68;
          [[25.4, cyB], [29.8, cyA]].forEach(([md, cy]) => {
            const m = s('line', { x1: x(md), x2: x(md), y1: cy - 9, y2: cy + 9, class: 's-ink', 'stroke-width': 2 }, svg);
            tl.from(m, { opacity: 0, duration: 0.4 }, 1.1);
          });
          [97.4, 142.0].forEach((v, i) => {
            const o = s('circle', { cx: x(v), cy: cyB, r: 5, class: 'ring s-b' }, svg);
            tip(o, `<span class="mono">Baseline outlier</span><b>${v.toFixed(1)} s</b> · AMCL recovery stall`);
            tl.from(o, { y: -40, opacity: 0, duration: 0.9, ease: 'bounce.out' }, 1.2 + i * 0.15);
          });
          const note = t(svg, x(119.7), cyB - 12, 'AMCL recovery stalls', { 'text-anchor': 'middle', class: 'rc-mono rc-mute' });
          const cap = t(svg, x(62) + 6, cyA + 18, 'no adaptive run > 62 s', { class: 'rc-mono rc-mute' });
          s('line', { x1: x(62), x2: x(62), y1: cyA - 6, y2: cyA + 14, class: 's-a', 'stroke-dasharray': '2 3' }, svg);
          tl.from([note, cap], { opacity: 0, duration: 0.6 }, 1.5);
        }
      });
      if (!narrow) t(svg, left, top - 6, 'median ┃   mean ●   band = ± σ', { class: 'rc-mono rc-mute' });
      return tl;
    },
  });
}
