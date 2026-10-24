// The M3 promotion gate as an interactive threshold: drag the consistency threshold and watch which
// candidate associations would be promoted. Data: Section 7.2, Fig. 6(a) and Table 5 Part B of
// Abaza et al., Robotics and Autonomous Systems 207 (2027) 105822. The frozen value is 0.80.
import { createChart, s, t, lin, tip, barPath, introTimeline } from '../research/chart-kit.js';

// name, dominant-node count of 4 observations, consistency, replay arms promoting of 9
const CANDIDATES = [
  ['wet_gloves', 4, 1.0, 9],
  ['quiet_corner', 3, 0.75, 8],
  ['deliveries', 2, 0.5, 0],
];
const FROZEN = 0.8;

export default function mount(el, ctx) {
  let threshold = FROZEN;
  return createChart(el, ctx, {
    title: 'M3 promotion gate · f ≥ 3, consistency ≥ θ, ≥ 1 accepted L3b',
    label: 'Three candidate associations, each observed four times: wet_gloves consistency 1.00, quiet_corner 0.75, deliveries 0.50. At the frozen threshold 0.80 only wet_gloves is promoted. A slider changes the threshold.',
    height: (w, tab, compact) => (compact ? 230 : 270),
    controls(box, redraw) {
      const wrap = document.createElement('label');
      wrap.className = 'rc-slider';
      wrap.innerHTML = '<span class="mono">Consistency threshold θ</span><input type="range" min="0.4" max="1" step="0.01" value="0.80" aria-label="Consistency threshold"><output class="mono">0.80 · frozen</output>';
      const input = wrap.querySelector('input');
      const out = wrap.querySelector('output');
      input.addEventListener('input', () => {
        threshold = Number(input.value);
        out.textContent = `${threshold.toFixed(2)}${Math.abs(threshold - FROZEN) < 0.001 ? ' · frozen' : ''}`;
        redraw();
      });
      box.prepend(wrap);
    },
    foot: () => {
      const n = CANDIDATES.filter((c) => c[2] >= threshold - 1e-9).length;
      return `At θ = ${threshold.toFixed(2)}, <b>${n} of 3</b> candidates promote. Every θ from 0.76 to 1.00 gives the same answer as the frozen 0.80 (only wet_gloves). The gate measures <b>sampled-output stability, not semantic truth</b>: model and seed replay promotes quiet_corner in 8 of 9 arms, so a low-sample rejection near the threshold is not robust.`;
    },
    table: () => ({ head: ['Candidate', 'Observations', 'Dominant node', 'Consistency', 'Archived decision', 'Replay arms promoting'], rows: CANDIDATES.map(([n, d, c, arms]) => [n, 4, `${d} of 4`, c.toFixed(2), c >= FROZEN ? 'promote' : 'reject', `${arms}/9`]) }),
    render({ svg, width, height }) {
      const tl = introTimeline();
      const narrow = width < 520;
      const left = narrow ? 104 : 132;
      const right = width - (narrow ? 16 : 150);
      const top = 26;
      const base = height - 30;
      const x = lin(0.4, 1, left, right);
      [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].forEach((v) => {
        s('line', { x1: x(v), x2: x(v), y1: top, y2: base, class: 'rc-grid' }, svg);
        t(svg, x(v), base + 18, v.toFixed(1), { 'text-anchor': 'middle', class: 'rc-num rc-mute' });
      });
      const rowH = (base - top) / CANDIDATES.length;
      CANDIDATES.forEach(([name, dom, c, arms], i) => {
        const cy = top + rowH * (i + 0.5);
        const promoted = c >= threshold - 1e-9;
        const g = s('g', {}, svg);
        s('rect', { x: 0, y: cy - rowH / 2 + 2, width, height: rowH - 4, class: 'rc-hover', rx: 6 }, g);
        t(g, 0, cy - 2, name, { class: 'rc-ink', 'font-family': 'var(--font-mono)' });
        // Four observation pips: dominant destination filled, others hollow.
        for (let k = 0; k < 4; k += 1) s('circle', { cx: 6 + k * 14, cy: cy + 14, r: 4.5, class: k < dom ? 'f-b' : 'ring s-b' }, g);
        s('path', { d: barPath(left, cy - 8, right - left, 16), class: 'rc-track' }, g);
        const bar = s('path', { d: barPath(left, cy - 8, x(c) - left, 16), class: promoted ? 'f-c' : 'f-mute' }, g);
        const lab = t(g, x(c) - 8, cy + 4, c.toFixed(2), { 'text-anchor': 'end', class: 'rc-num', style: promoted ? 'fill:#fff' : '' });
        if (!narrow) {
          t(g, right + 16, cy - 2, promoted ? 'PROMOTED' : 'REJECTED', { class: 'rc-mono', style: `fill:${promoted ? 'var(--rc-c)' : 'var(--rc-mute)'};font-weight:600` });
          t(g, right + 16, cy + 14, `replay: ${arms}/9 arms`, { class: 'rc-mono rc-mute' });
        }
        tip(g, `<span class="mono">${name}</span>${dom} of 4 observations on the dominant node · consistency <b>${c.toFixed(2)}</b><br>${promoted ? 'promoted' : 'rejected'} at θ = ${threshold.toFixed(2)} · model/seed replay promotes in ${arms}/9 arms`);
        tl.from(bar, { scaleX: 0, svgOrigin: `${left} ${cy}`, duration: 1 }, 0.1 + i * 0.15).from(lab, { opacity: 0, duration: 0.4 }, 0.9 + i * 0.15);
      });
      const tx = x(threshold);
      const line = s('line', { x1: tx, x2: tx, y1: top - 14, y2: base, class: 's-a', 'stroke-width': 2 }, svg);
      const lt = t(svg, tx, top - 16, `θ ${threshold.toFixed(2)}`, { 'text-anchor': 'middle', class: 'rc-num', 'font-weight': 600 });
      tl.from([line, lt], { opacity: 0, duration: 0.6 }, 0.6);
      return tl;
    },
  });
}
