// CPU load, thermal margin and on-device YOLO26n inference per platform.
// Data: Table 11 of Abaza et al., Sensors 2026, 26, 2232 (Xplorer-A/B single RPi 5, Xplorer-C dual RPi 5 with offloaded detector).
import { createChart, s, t, lin, tip, barPath, introTimeline } from '../research/chart-kit.js';

const CPU = [
  ['Xplorer-A', 'single RPi 5', 86.2, 2.8, 85.5, 2.2],
  ['Xplorer-B', 'single RPi 5', 87.7, 2.6, 83.1, 2.8],
  ['Xplorer-C', 'dual RPi 5', 50.9, 5.8, 46.3, 6.2],
];
const TEMP = [['Xplorer-A', 65.6, 0.9], ['Xplorer-B', 66.0, 0.6], ['Xplorer-C', 69.3, 4.2]];
const YOLO = [['Xplorer-A', 5.4, 0.5, 169.2, 16.8], ['Xplorer-B', 5.6, 0.8, 165.5, 23.8]];

export default function mount(el, ctx) {
  return createChart(el, ctx, {
    title: 'Edge compute budget · Raspberry Pi 5',
    label: 'Bar chart of CPU utilisation: about 85 percent on the single-board Xplorer-A and B, about 48 percent on dual-board Xplorer-C where YOLO inference is offloaded.',
    tabs: ['CPU load', 'Thermal margin', 'YOLO26n inference'],
    legend: [['b', 'Baseline'], ['a', 'Adaptive']],
    height: (w, tab, compact) => (tab === 0 ? (compact ? 250 : 320) : 230),
    foot: (tab) => [
      'Offloading the detector to a second RPi 5 over Ethernet drops the navigation board from <b>≈85% to ≈48%</b>, about 40 percentage points, with no code change: detections arrive on the same topic.',
      'Peak CPU temperature stayed below 70 °C on every platform, well under the 85 °C RPi 5 throttling threshold.',
      'YOLO26n via NCNN, C++ lifecycle node, 4 threads, 416 × 416 input: <b>5.5 ± 0.7 FPS</b> overall (167 ± 21 ms). Xplorer-C runs the detector remotely, so its diagnostics were not captured on the navigation board.',
    ][tab],
    table: (tab) => [
      { caption: 'CPU total, mean ± SD (Table 11)', head: ['Robot', 'Architecture', 'Baseline', 'Adaptive'], rows: CPU.map(([r, a, b, bs, ad, as]) => [r, a, `${b}% ± ${bs}`, `${ad}% ± ${as}`]) },
      { caption: 'CPU temperature max (Table 11)', head: ['Robot', 'Max temperature'], rows: TEMP.map(([r, v, sd]) => [r, `${v} ± ${sd} °C`]) },
      { caption: 'YOLO26n diagnostics (Table 11)', head: ['Robot', 'FPS', 'Inference time'], rows: [...YOLO.map(([r, f, fs, i, is]) => [r, `${f} ± ${fs} Hz`, `${i} ± ${is} ms`]), ['Xplorer-C', 'N/A (remote)', 'N/A (remote)']] },
    ][tab],
    render({ svg, width, height, tab }) {
      const tl = introTimeline();
      if (tab === 0) return cpu(svg, width, height, tl);
      if (tab === 1) return hbars(svg, width, height, tl, TEMP.map(([r, v, sd]) => [r, v, sd, `${v} °C`]), 100, 85, '85 °C throttle', '°C', 'c');
      return hbars(svg, width, height, tl, YOLO.map(([r, , , i, is]) => [r, i, is, `${i} ms · ${YOLO.find((y) => y[0] === r)[1]} FPS`]), 250, null, null, 'ms', 'a');
    },
  });
}

function cpu(svg, width, height, tl) {
  const left = 40;
  const right = width - 10;
  const top = 26;
  const base = height - 44;
  const y = lin(0, 100, base, top);
  [0, 25, 50, 75, 100].forEach((v) => {
    s('line', { x1: left, x2: right, y1: y(v), y2: y(v), class: v ? 'rc-grid' : 'rc-axis' }, svg);
    t(svg, left - 8, y(v) + 4, `${v}%`, { 'text-anchor': 'end', class: 'rc-num rc-mute' });
  });
  const gw = (right - left) / CPU.length;
  const bw = Math.min(46, gw * 0.28);
  CPU.forEach(([robot, arch, b, bs, a, as], i) => {
    const cx = left + gw * (i + 0.5);
    [['b', b, bs, 'Baseline', -1], ['a', a, as, 'Adaptive', 1]].forEach(([k, v, sd, name, side]) => {
      const x0 = cx + (side < 0 ? -bw - 2 : 2);
      const g = s('g', {}, svg);
      s('rect', { x: x0 - 4, y: top, width: bw + 8, height: base - top, class: 'rc-hover', rx: 6 }, g);
      const bar = s('path', { d: barPath(x0, y(v), bw, base - y(v), 4, false), class: `f-${k}` }, g);
      const wh = s('line', { x1: x0 + bw / 2, x2: x0 + bw / 2, y1: y(v + sd), y2: y(v - sd), class: 's-ink', 'stroke-width': 1.5, opacity: 0.6 }, g);
      const lbl = t(g, x0 + bw / 2, y(v + sd) - 6, `${Math.round(v)}%`, { 'text-anchor': 'middle', class: 'rc-num' });
      tip(g, `<span class="mono">${robot} · ${name}</span><b>${v}% ± ${sd}</b> CPU total`);
      tl.from(bar, { scaleY: 0, svgOrigin: `${x0} ${base}`, duration: 1.1 }, 0.1 + i * 0.15 + (side > 0 ? 0.08 : 0))
        .from([wh, lbl], { opacity: 0, duration: 0.5 }, 0.9 + i * 0.15);
    });
    t(svg, cx, base + 18, robot, { 'text-anchor': 'middle', class: 'rc-ink' });
    t(svg, cx, base + 33, arch, { 'text-anchor': 'middle', class: 'rc-mono rc-mute' });
  });
  // Bracket showing the offloading drop between single-board and dual-board platforms.
  const xB = left + gw * 1.5 + bw;
  const xC = left + gw * 2.5 - bw;
  const path = s('path', { d: `M${xB},${y(92)} C${(xB + xC) / 2},${y(104)} ${(xB + xC) / 2},${y(104)} ${xC},${y(60)}`, fill: 'none', class: 's-a', 'stroke-width': 2, 'stroke-dasharray': '4 4' }, svg);
  const lab = t(svg, (xB + xC) / 2, y(100) - 4, '≈ −40 pp', { 'text-anchor': 'middle', class: 'rc-num', 'font-weight': 600 });
  tl.from(path, { drawSVG: '0%', duration: 1, ease: 'power2.inOut' }, 1.1).from(lab, { opacity: 0, y: 8, duration: 0.6 }, 1.5);
  return tl;
}

function hbars(svg, width, height, tl, rows, max, limit, limitLabel, unit, k) {
  const left = width < 480 ? 78 : 104;
  const right = width - 20;
  const top = 20;
  const base = height - 28;
  const x = lin(0, max, left, right);
  const step = (base - top) / rows.length;
  for (let v = 0; v <= max; v += max / 5) {
    s('line', { x1: x(v), x2: x(v), y1: top, y2: base, class: 'rc-grid' }, svg);
    t(svg, x(v), base + 18, `${v}${v === max ? ` ${unit}` : ''}`, { 'text-anchor': 'middle', class: 'rc-num rc-mute' });
  }
  rows.forEach(([robot, v, sd, label], i) => {
    const cy = top + step * (i + 0.5);
    const g = s('g', {}, svg);
    s('rect', { x: 0, y: cy - step / 2 + 2, width, height: step - 4, class: 'rc-hover', rx: 6 }, g);
    t(g, 0, cy + 4, robot.replace(width < 480 ? 'Xplorer-' : '', width < 480 ? 'X-' : ''), { class: 'rc-ink' });
    const bar = s('path', { d: barPath(left, cy - 9, x(v) - left, 18), class: `f-${k}` }, g);
    s('line', { x1: x(v - sd), x2: x(v + sd), y1: cy, y2: cy, class: 's-ink', 'stroke-width': 1.5, opacity: 0.6 }, g);
    const lbl = t(g, x(v + sd) + 8, cy + 4, label, { class: 'rc-num' });
    tip(g, `<span class="mono">${robot}</span><b>${v} ± ${sd} ${unit}</b>`);
    tl.from(bar, { scaleX: 0, svgOrigin: `${left} ${cy}`, duration: 1 }, 0.1 + i * 0.12).from(lbl, { opacity: 0, duration: 0.5 }, 0.8 + i * 0.12);
  });
  if (limit) {
    const l = s('line', { x1: x(limit), x2: x(limit), y1: top - 8, y2: base, class: 's-a', 'stroke-width': 2, 'stroke-dasharray': '5 4' }, svg);
    const lt = t(svg, x(limit) - 6, top - 10, limitLabel, { 'text-anchor': 'end', class: 'rc-mono' });
    tl.from([l, lt], { opacity: 0, duration: 0.6 }, 0.9);
  }
  return tl;
}
