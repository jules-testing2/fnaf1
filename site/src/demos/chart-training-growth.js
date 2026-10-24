// Training data growth and model card for the ai_covariance Random Forest.
// Data: Sections 2.3, 2.4, 3.1 and 3.2 of Abaza, Sensors 2025, 25, 3026.
import { createChart, s, t, lin, tip, barPath, introTimeline } from '../research/chart-kit.js';

const TILES = [
  ['R² error_x', 0.98, 2], ['R² error_y', 0.97, 2], ['R² error_yaw', 0.99, 2], ['Test MAE', 0.0061, 4],
];

export default function mount(el, ctx) {
  return createChart(el, ctx, {
    title: 'ai_covariance model · data and fit',
    label: 'Dataset grew from about 16,000 teleoperation records to more than 21,000 samples by version 7, split 90 to 10. Random Forest with 100 trees reached R squared 0.98, 0.97 and 0.99 for x, y and yaw error, MAE 0.0061.',
    height: (w) => (w < 560 ? 420 : 300),
    foot: '100-tree Random Forest (scikit-learn defaults), trained on the Raspberry Pi 4 itself; out-of-bag error settles after about 30 trees. Inference ≈10 ms per prediction; the full AI node ran at 25% average CPU (40% peak) and ≈350 MB.',
    table: () => ({
      head: ['Quantity', 'Value'],
      rows: [
        ['Initial teleoperation dataset', 'over 16,000 records'],
        ['Dataset v7 (with operational logs)', 'over 21,000 samples'],
        ['Train / test split', '90:10 (≈18,900 / ≈2,100)'],
        ['Input features', '15'],
        ['R² overall', '0.989'],
        ...TILES.map(([k, v, d]) => [k, v.toFixed(d)]),
      ],
    }),
    render({ svg, width, height }) {
      const tl = introTimeline();
      const left = 0;
      const right = width - 8;
      const x = lin(0, 22000, left, right);

      t(svg, 0, 14, 'Training samples', { class: 'rc-mono rc-mute' });
      const y1 = 30;
      s('path', { d: barPath(left, y1, right - left, 26, 6), class: 'rc-track' }, svg);
      const g1 = s('g', {}, svg);
      const seed = s('path', { d: barPath(left, y1, x(16000) - left, 26, 0), class: 'f-b' }, g1);
      tip(g1, '<span class="mono">Initial dataset</span><b>over 16,000</b> records from manual teleoperation');
      const g2 = s('g', {}, svg);
      const grow = s('path', { d: barPath(x(16000) + 2, y1, x(21000) - x(16000) - 2, 26, 6), class: 'f-a' }, g2);
      tip(g2, '<span class="mono">Iterative datalogging</span>ai_covariance_node CSV logs merged in: <b>over 21,000</b> samples by v7');
      const count = t(svg, x(21000) - 8, y1 + 18, '16,000', { 'text-anchor': 'end', class: 'rc-num', fill: '#0a0a0b', style: 'fill:#0a0a0b;font-weight:600' });
      t(svg, 6, y1 + 18, 'teleoperation', { class: 'rc-mono', style: 'fill:#fff' });
      t(svg, right, y1 + 46, 'v7 · operational logs added', { 'text-anchor': 'end', class: 'rc-mono rc-mute' });
      const c = { v: 16000 };
      tl.from(seed, { scaleX: 0, svgOrigin: `${left} ${y1}`, duration: 1 }, 0.1)
        .from(grow, { scaleX: 0, svgOrigin: `${x(16000)} ${y1}`, duration: 1.2, ease: 'power2.inOut' }, 1)
        .fromTo(c, { v: 16000 }, { v: 21000, duration: 1.2, ease: 'power2.inOut', onUpdate: () => (count.textContent = `${Math.round(c.v / 100) * 100 >= 21000 ? '21,000+' : Math.round(c.v).toLocaleString('en-US')}`) }, 1);

      const y2 = 96;
      t(svg, 0, y2 - 10, 'Split (v7)', { class: 'rc-mono rc-mute' });
      const tr = s('path', { d: barPath(left, y2, x(18900) - left, 14, 0), class: 'f-c' }, svg);
      const te = s('path', { d: barPath(x(18900) + 2, y2, x(21000) - x(18900) - 2, 14, 4), class: 'f-d' }, svg);
      const l1 = t(svg, 0, y2 + 32, 'train 90% ≈ 18,900', { class: 'rc-num' });
      const l2 = t(svg, x(21000), y2 + 32, 'test 10% ≈ 2,100', { 'text-anchor': 'end', class: 'rc-num' });
      tl.from([tr, te], { scaleX: 0, svgOrigin: `${left} ${y2}`, duration: 0.9, stagger: 0.2 }, 1.6).from([l1, l2], { opacity: 0, duration: 0.5 }, 2);

      const narrow = width < 560;
      const cols = narrow ? 2 : 4;
      const gap = 12;
      const tw = (width - gap * (cols - 1)) / cols;
      const th = 104;
      const ty = 160;
      TILES.forEach(([k, v, d], i) => {
        const cx = (i % cols) * (tw + gap);
        const cy = ty + Math.floor(i / cols) * (th + gap);
        const g = s('g', {}, svg);
        s('rect', { x: cx, y: cy, width: tw, height: th, rx: 14, class: 'rc-track' }, g);
        t(g, cx + 16, cy + 26, k, { class: 'rc-mono rc-mute' });
        const val = t(g, cx + 16, cy + 72, v.toFixed(d), { class: 'rc-big' });
        if (k.startsWith('R²')) {
          s('path', { d: barPath(cx + 16, cy + th - 16, tw - 32, 4, 2), class: 'rc-track' }, g);
          const fill = s('path', { d: barPath(cx + 16, cy + th - 16, (tw - 32) * v, 4, 2), class: 'f-a' }, g);
          tl.from(fill, { scaleX: 0, svgOrigin: `${cx + 16} ${cy}`, duration: 1 }, 2.1 + i * 0.1);
        }
        tip(g, `<span class="mono">${k}</span><b>${v.toFixed(d)}</b> on the held-out test set`);
        const o = { v: 0 };
        tl.from(g, { opacity: 0, y: 16, duration: 0.6 }, 1.9 + i * 0.1)
          .fromTo(o, { v: 0 }, { v, duration: 1.2, ease: 'power3.out', onUpdate: () => (val.textContent = o.v.toFixed(d)) }, 2 + i * 0.1);
      });
      return tl;
    },
  });
}
