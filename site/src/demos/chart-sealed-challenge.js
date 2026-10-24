// Sealed 28-instruction challenge (E7) and negation/exclusion guard behaviour (E2).
// Data: Section 7.1 and Fig. 5(b, c) of Abaza et al., Robotics and Autonomous Systems 207 (2027) 105822.
import { createChart, s, t, lin, tip, barPath, introTimeline } from '../research/chart-kit.js';

// Acceptable cells and deterministic fast-path cells per difficulty level (Fig. 5c).
const LEVELS = [
  ['P1', 6, 6, 3, 0], ['P2', 6, 2, 0, 0], ['P3', 6, 4, 0, 0], ['P4', 6, 2, 0, 0],
  ['G', 4, 3, 2, 1], // two fast-path cells in G; one of them (G-3) was incorrect
];
const OUTCOMES = [
  ['Acceptable selection', 17, 'c'],
  ['Wrong destination', 6, 'a'],
  ['Executed, clarification was required', 2, 'd'],
  ['Parsing failure', 3, 'mute'],
  ['Clarification request', 0, 'b'],
];
const GUARD = [
  ['Clarification outcome', 22, 'b'],
  ['Actionable, non-forbidden node', 13, 'c'],
  ['Parse or escalation error', 4, 'mute'],
];

export default function mount(el, ctx) {
  return createChart(el, ctx, {
    title: 'Hard cases · sealed challenge and negation guard',
    label: 'Waffle chart of 28 sealed instruction cells: 17 acceptable, 6 wrong destinations, 2 executed where clarification was required, 3 parsing failures. Second view: 39 negation guard activations, 22 clarifications, 13 actionable non-forbidden resolutions, 4 errors, 0 forbidden destinations executed.',
    tabs: ['Sealed challenge (E7)', 'Negation guard (E2)'],
    height: (w, tab) => {
      if (tab === 1) return w < 520 ? 330 : 260;
      const { cell, gap, groupGap } = dims(w);
      const gw = 3 * cell + 2 * gap;
      const perRow = Math.max(1, Math.floor((w + groupGap) / (gw + groupGap)));
      const rows = Math.ceil(LEVELS.length / perRow);
      return 22 + rows * (2 * (cell + gap) + 44) + (w < 520 ? 100 : 60);
    },
    foot: (tab) => (tab === 0
      ? '28 unseen instructions, acceptable-destination sets sealed before execution, Xplorer-B only. <b>17/28</b> acceptable (P1–P4 grid 14/24, extra cells 3/4). Five cells took the deterministic fast path; one of them, G-3 “Where is the H sign?”, reached a wrong node (false-fast 1/28). An independent evaluator’s judgments give 16/28.'
      : '14 negation or exclusion intents produced <b>39 repeated guard activations</b>. The guard runs before every resolver step, so stored associations cannot override an exclusion. <b>No forbidden destination was executed.</b> The model never proposed one here, so the post-response block acted as defence in depth.'),
    table: (tab) => (tab === 0
      ? { head: ['Level / outcome', 'Cells'], rows: [...LEVELS.map(([l, n, ok, fast]) => [`${l}: acceptable`, `${ok}/${n}${fast ? ` (${fast} fast path)` : ''}`]), ...OUTCOMES.map(([n, v]) => [n, v])] }
      : { head: ['Guard outcome', 'Activations'], rows: [...GUARD.map(([n, v]) => [n, v]), ['Forbidden destination executed', 0]] }),
    render({ svg, width, height, tab }) {
      const tl = introTimeline();
      return tab === 0 ? sealed(svg, width, height, tl) : guard(svg, width, height, tl);
    },
  });
}

function dims(width) {
  const narrow = width < 520;
  return { cell: narrow ? 30 : 38, gap: 6, groupGap: narrow ? 16 : 26 };
}

function sealed(svg, width, height, tl) {
  const { cell, gap, groupGap } = dims(width);
  const cols = 3;
  let gx = 0;
  let gy = 22;
  const groups = [];
  LEVELS.forEach(([lvl, n]) => {
    const gw = cols * cell + (cols - 1) * gap;
    if (gx + gw > width) { gx = 0; gy += 2 * (cell + gap) + 44; }
    groups.push([gx, gy]);
    gx += gw + groupGap;
  });
  const cells = [];
  LEVELS.forEach(([lvl, n, ok, fast, fastWrong], li) => {
    const [ox, oy] = groups[li];
    t(svg, ox, oy - 8, lvl === 'G' ? 'G · extra' : lvl, { class: 'rc-mono rc-mute' });
    t(svg, ox + cols * (cell + gap) - gap, oy - 8, `${ok}/${n}`, { 'text-anchor': 'end', class: 'rc-num' });
    for (let i = 0; i < n; i += 1) {
      const x = ox + (i % cols) * (cell + gap);
      const y = oy + Math.floor(i / cols) * (cell + gap);
      // Order inside a level: acceptable first; fast-path markers on the first acceptable cells, and on the wrong G-3 cell.
      const good = i < ok;
      const isFast = (good && i < fast - fastWrong) || (!good && fastWrong && i === ok);
      const g = s('g', {}, svg);
      const r = s('rect', { x, y, width: cell, height: cell, rx: 6, class: good ? 'f-c' : 'rc-track', stroke: good ? 'none' : 'var(--rc-axis)', 'stroke-width': 1 }, g);
      if (isFast) s('circle', { cx: x + cell - 8, cy: y + 8, r: 3.5, fill: good ? '#fff' : 'var(--rc-a)' }, g);
      tip(g, `<span class="mono">Level ${lvl}</span>${good ? '<b>Acceptable</b> destination' : '<b>Not acceptable</b>'}${isFast ? ' · deterministic fast path' : ''}`);
      cells.push(r);
    }
  });
  tl.from(cells, { scale: 0, transformOrigin: '50% 50%', duration: 0.5, stagger: 0.03, ease: 'back.out(2)' }, 0.1);

  const by = gy + 2 * (cell + gap) + 30;
  t(svg, 0, by, 'Final outcomes (28 cells)', { class: 'rc-mono rc-mute' });
  const x = lin(0, 28, 0, width);
  let acc = 0;
  OUTCOMES.forEach(([name, v, k], i) => {
    if (!v) return;
    const g = s('g', {}, svg);
    const p = s('path', { d: barPath(x(acc) + (acc ? 2 : 0), by + 10, x(v) - x(0) - (acc ? 2 : 0), 20, 0), class: `f-${k}` }, g);
    tip(g, `<span class="mono">${name}</span><b>${v}</b> of 28 cells`);
    tl.from(p, { scaleX: 0, svgOrigin: `${x(acc)} ${by}`, duration: 0.5 }, 1.2 + i * 0.15);
    acc += v;
  });
  // Legend rows under the bar (direct labels would collide on narrow screens).
  let lx = 0;
  let ly = by + 50;
  OUTCOMES.forEach(([name, v, k]) => {
    const label = `${name} ${v}`;
    const w = label.length * 6.6 + 26;
    if (lx + w > width) { lx = 0; ly += 20; }
    s('rect', { x: lx, y: ly - 10, width: 10, height: 10, rx: 2, class: `f-${k}` }, svg);
    t(svg, lx + 15, ly, label, { class: v ? '' : 'rc-mute' });
    lx += w;
  });
  t(svg, width, 12, '● fast path', { 'text-anchor': 'end', class: 'rc-mono rc-mute' });
  return tl;
}

function guard(svg, width, height, tl) {
  const narrow = width < 520;
  const per = narrow ? 10 : 13;
  const cell = Math.min(30, (width - (per - 1) * 6) / per);
  const cells = [];
  let idx = 0;
  GUARD.forEach(([name, v, k]) => {
    for (let i = 0; i < v; i += 1) {
      const x = (idx % per) * (cell + 6);
      const y = 10 + Math.floor(idx / per) * (cell + 6);
      const g = s('g', {}, svg);
      cells.push(s('rect', { x, y, width: cell, height: cell, rx: cell / 2, class: `f-${k}` }, g));
      tip(g, `<span class="mono">Guard activation</span><b>${name}</b>`);
      idx += 1;
    }
  });
  tl.from(cells, { scale: 0, transformOrigin: '50% 50%', duration: 0.45, stagger: 0.02, ease: 'back.out(2)' }, 0.1);
  const rows = Math.ceil(39 / per);
  let ly = 10 + rows * (cell + 6) + 18;
  let lx = 0;
  GUARD.forEach(([name, v, k]) => {
    const label = `${name} · ${v}`;
    const w = label.length * 6.6 + 30;
    if (lx + w > width) { lx = 0; ly += 20; }
    s('rect', { x: lx, y: ly - 10, width: 10, height: 10, rx: 5, class: `f-${k}` }, svg);
    t(svg, lx + 15, ly, label);
    lx += w;
  });
  const zy = ly + 44;
  const zero = t(svg, 0, zy, '0 / 39', { class: 'rc-big', style: 'font-size:34px' });
  const zl = t(svg, narrow ? 0 : 110, narrow ? zy + 22 : zy - 6, 'forbidden destinations executed', { class: 'rc-ink' });
  tl.from([zero, zl], { opacity: 0, y: 10, duration: 0.6 }, 1.2);
  return tl;
}
