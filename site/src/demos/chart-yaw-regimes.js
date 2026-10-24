// Yaw prediction error by motion regime, and yaw_diff spread with AI-predicted vs static covariance.
// Data: Table 3, Section 3.5 and Section 4 of Abaza, Sensors 2025, 25, 3026.
import { createChart, s, t, lin, tip, barPath, introTimeline } from '../research/chart-kit.js';

// |error_yaw − yaw_diff| (rad), AI-enabled run: mean, std, max, median (median reported for Static and Moderate only).
const PRED = [
  ['Static', 0.0543, 0.0899, 0.9491, 0.0362],
  ['Moderate', 0.0710, 0.0975, 0.6680, 0.0381],
  ['Aggressive', 0.2257, 0.2600, 0.9491, null],
];
// Interquartile range of yaw_diff (rad), AI-enabled vs AI-disabled (static covariance).
const IQR = [
  ['Static', 0.0489, 0.0222],
  ['Moderate', 0.1069, 0.1399],
  ['Aggressive', 0.2695, null],
];

export default function mount(el, ctx) {
  return createChart(el, ctx, {
    title: 'Yaw error · Static / Moderate / Aggressive',
    label: 'Yaw prediction error by motion regime: mean 0.0543 rad static, 0.0710 rad moderate, 0.2257 rad aggressive, with maxima up to 0.9491 rad. Second view compares yaw_diff interquartile ranges for AI-predicted and static covariance.',
    tabs: ['Prediction error by regime', 'yaw_diff spread: AI vs static'],
    legend: [],
    height: (w, tab, compact) => (compact ? 240 : 300),
    foot: (tab) => (tab === 0
      ? 'Metric: |error_yaw − yaw_diff|, the gap between the Random Forest’s predicted yaw error and the measured one. Medians <b>0.0362 rad</b> (static) and <b>0.0381 rad</b> (moderate); aggressive turns reach <b>0.9491 rad</b>, traced to few high-dynamic samples in training. Aggressive here means |cmd_angular_z| > 0.5 rad/s (no samples exceeded 0.7).'
      : 'Interquartile range of yaw_diff. With AI covariance the spread is tighter in moderate motion (<b>0.1069 vs 0.1399 rad</b>); in static conditions the static baseline is tighter (0.0222 vs 0.0489 rad). Max |yaw_diff|: 0.4943 rad with AI, 0.5771 rad without. The baseline run had no samples in the aggressive band.'),
    table: (tab) => (tab === 0
      ? { caption: 'Table 3, AI-enabled run (rad)', head: ['Regime', 'Mean', 'Std', 'Max', 'Median'], rows: PRED.map(([r, m, sd, mx, md]) => [r, m.toFixed(4), sd.toFixed(4), mx.toFixed(4), md == null ? 'not reported' : md.toFixed(4)]) }
      : { caption: 'yaw_diff IQR, Section 3.5 (rad)', head: ['Regime', 'AI-enabled', 'AI-disabled (static)'], rows: IQR.map(([r, a, b]) => [r, a.toFixed(4), b == null ? 'no data' : b.toFixed(4)]) }),
    render({ svg, width, height, tab }) {
      const tl = introTimeline();
      const narrow = width < 480;
      const left = narrow ? 86 : 110;
      const right = width - 24;
      const top = 30;
      const base = height - 30;
      const max = tab === 0 ? 1 : 0.3;
      const x = lin(0, max, left, right);
      const ticks = tab === 0 ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.1, 0.2, 0.3];
      ticks.forEach((v) => {
        s('line', { x1: x(v), x2: x(v), y1: top - 8, y2: base, class: 'rc-grid' }, svg);
        t(svg, x(v), base + 18, `${v}${v === max ? ' rad' : ''}`, { 'text-anchor': 'middle', class: 'rc-num rc-mute' });
      });
      const rowH = (base - top) / 3;

      if (tab === 0) {
        t(svg, left, top - 14, 'bar = mean   ┃ median   ─ ±σ   ◯ max', { class: 'rc-mono rc-mute' });
        PRED.forEach(([r, m, sd, mx, md], i) => {
          const cy = top + rowH * (i + 0.5);
          const g = s('g', {}, svg);
          s('rect', { x: 0, y: cy - rowH / 2 + 3, width, height: rowH - 6, class: 'rc-hover', rx: 6 }, g);
          t(g, 0, cy + 4, r, { class: 'rc-ink' });
          const bar = s('path', { d: barPath(left, cy - 10, x(m) - left, 20), class: 'f-a' }, g);
          const wh = s('line', { x1: x(Math.max(0, m - sd)), x2: x(m + sd), y1: cy, y2: cy, class: 's-ink', 'stroke-width': 1.5, opacity: 0.55 }, g);
          const mxm = s('circle', { cx: x(mx), cy, r: 6, class: 'ring s-a' }, g);
          const mxl = t(g, x(mx) - 10, cy - 12, mx.toFixed(4), { 'text-anchor': 'end', class: 'rc-num rc-mute' });
          const lab = t(g, x(m + sd) + 8, cy + 4, m.toFixed(4), { class: 'rc-num' });
          const parts = [wh, lab, mxl];
          if (md != null) {
            const mk = s('line', { x1: x(md), x2: x(md), y1: cy - 14, y2: cy + 14, class: 's-ink', 'stroke-width': 2 }, g);
            parts.push(mk);
          }
          tip(g, `<span class="mono">${r} · AI-enabled</span>mean <b>${m.toFixed(4)}</b> · σ ${sd.toFixed(4)} · max ${mx.toFixed(4)} rad${md != null ? ` · median <b>${md.toFixed(4)}</b>` : ''}`);
          tl.from(bar, { scaleX: 0, svgOrigin: `${left} ${cy}`, duration: 1 }, 0.1 + i * 0.15)
            .from(parts, { opacity: 0, duration: 0.5 }, 0.8 + i * 0.15)
            .from(mxm, { scale: 0, svgOrigin: `${x(mx)} ${cy}`, duration: 0.7, ease: 'back.out(3)' }, 1 + i * 0.15);
        });
        return tl;
      }

      IQR.forEach(([r, a, b], i) => {
        const cy = top + rowH * (i + 0.5);
        t(svg, 0, cy + 4, r, { class: 'rc-ink' });
        [['a', a, 'AI-predicted covariance', -1], ['b', b, 'Static covariance', 1]].forEach(([k, v, name, side]) => {
          const y0 = cy + (side < 0 ? -15 : 3);
          const g = s('g', {}, svg);
          s('rect', { x: left, y: y0 - 2, width: right - left, height: 16, class: 'rc-hover', rx: 4 }, g);
          if (v == null) {
            t(g, left + 4, y0 + 10, 'static baseline: no samples in this band', { class: 'rc-mono rc-mute' });
            return;
          }
          const bar = s('path', { d: barPath(left, y0, x(v) - left, 12), class: `f-${k}` }, g);
          const lab = t(g, x(v) + 8, y0 + 10, v.toFixed(4), { class: 'rc-num' });
          tip(g, `<span class="mono">${r} · ${name}</span>IQR <b>${v.toFixed(4)} rad</b>`);
          tl.from(bar, { scaleX: 0, svgOrigin: `${left} ${y0}`, duration: 1 }, 0.1 + i * 0.15 + (side > 0 ? 0.1 : 0)).from(lab, { opacity: 0, duration: 0.4 }, 0.8 + i * 0.15);
        });
      });
      const lg = s('g', {}, svg);
      [['a', 'AI-predicted'], ['b', 'Static covariance']].forEach(([k, n], i) => {
        const lx = left + i * (narrow ? 112 : 130);
        s('rect', { x: lx, y: top - 24, width: 10, height: 10, rx: 2, class: `f-${k}` }, lg);
        t(lg, lx + 15, top - 15, n, { class: 'rc-mono rc-mute' });
      });
      return tl;
    },
  });
}
