// Small toolkit shared by the research chart demos (src/demos/chart-*.js).
// Charts are plain SVG rebuilt at the container's real pixel width (so text stays legible on phones),
// animated in once with GSAP when they first become visible, and paired with a data-table view.
//
//   const chart = createChart(el, options, { title, legend, tabs, table, render });
//   render(ctx) draws into ctx.svg at ctx.width and returns a GSAP timeline (or null) for the intro.

import gsap from 'gsap';
import './chart-kit.css';

const NS = 'http://www.w3.org/2000/svg';

/** Create an SVG element with attributes and append it to parent. */
export function s(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

/** SVG text helper. */
export function t(parent, x, y, text, attrs = {}) {
  const n = s('text', { x, y, ...attrs }, parent);
  n.textContent = text;
  return n;
}

export const lin = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
export const log10 = (d0, d1, r0, r1) => (v) => r0 + ((Math.log10(v) - Math.log10(d0)) / (Math.log10(d1) - Math.log10(d0))) * (r1 - r0);

/** Rounded-end bar path anchored to a baseline (radius only on the data end). */
export function barPath(x, y, w, h, r = 4, horizontal = true) {
  if (w <= 0 || h <= 0) return '';
  if (horizontal) {
    const rr = Math.min(r, w, h / 2);
    return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
  }
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Series colour tokens (validated with the dataviz palette checker for both surfaces). */
export const SERIES = ['a', 'b', 'c', 'd'];

let tipEl = null;
function tooltip() {
  if (tipEl) return tipEl;
  tipEl = document.createElement('div');
  tipEl.className = 'rc-tip';
  tipEl.setAttribute('role', 'status');
  document.body.appendChild(tipEl);
  return tipEl;
}

/** Attach a hover/focus tooltip to an SVG mark (use a hit target larger than the mark when possible). */
export function tip(node, html) {
  node.setAttribute('tabindex', '0');
  node.classList.add('rc-hit');
  const show = (e) => {
    const el = tooltip();
    el.innerHTML = html;
    el.classList.add('is-on');
    const r = node.getBoundingClientRect();
    const x = e && e.clientX ? e.clientX : r.left + r.width / 2;
    const y = e && e.clientY ? e.clientY : r.top;
    const w = el.offsetWidth;
    el.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2))}px`;
    el.style.top = `${Math.max(8, y - el.offsetHeight - 14)}px`;
  };
  const hide = () => tipEl?.classList.remove('is-on');
  node.addEventListener('pointermove', show);
  node.addEventListener('pointerleave', hide);
  node.addEventListener('focus', () => show());
  node.addEventListener('blur', hide);
}

/**
 * Builds the frame and wires the lifecycle shared by every chart.
 * @param {HTMLElement} el
 * @param {{options:object, reducedMotion:boolean}} ctx
 * @param {{title:string, label:string, legend?:Array<[string,string]>, tabs?:string[], foot?:string|((tab:number)=>string),
 *          table:(tab:number)=>{head:string[], rows:Array<Array<string|number>>, caption?:string},
 *          render:(c:{svg:SVGElement,width:number,tab:number,compact:boolean,theme:string})=>(gsap.core.Timeline|null),
 *          height:(width:number, tab:number, compact:boolean)=>number}} spec
 */
export function createChart(el, { options = {}, reducedMotion = false }, spec) {
  const theme = options.theme === 'paper' ? 'paper' : 'dark';
  const compact = !!options.compact;
  let tab = Number(options.tab) || 0;
  let introDone = reducedMotion;
  let tl = null;
  let width = 0;

  const root = document.createElement('div');
  root.className = `rc rc--${theme}${options.bare ? ' rc--bare' : ' demo-frame'}`;
  const legend = (spec.legend || []).map(([k, label]) => `<span class="rc__key"><i class="rc-sw rc-sw--${k}"></i>${label}</span>`).join('');
  const tabs = spec.tabs && spec.tabs.length > 1
    ? `<div class="rc__tabs" role="tablist" aria-label="${spec.title} view">${spec.tabs.map((name, i) => `<button type="button" role="tab" aria-selected="${i === tab}" data-tab="${i}">${name}</button>`).join('')}</div>`
    : '';
  root.innerHTML = `
    ${options.bare ? '' : `<div class="demo-frame__bar rc__bar"><span class="mono">${spec.title}</span><button type="button" class="rc__toggle mono" aria-expanded="false">Data table</button></div>`}
    ${tabs || legend ? `<div class="rc__controls">${tabs}${legend ? `<div class="rc__legend">${legend}</div>` : ''}</div>` : ''}
    <div class="rc__body"><svg class="rc__svg" role="img" aria-label="${spec.label}"></svg></div>
    <div class="rc__table" hidden></div>
    <p class="rc__foot"></p>`;
  el.appendChild(root);

  const svg = root.querySelector('svg');
  const body = root.querySelector('.rc__body');
  const tableBox = root.querySelector('.rc__table');
  const foot = root.querySelector('.rc__foot');

  function renderTable() {
    const { head, rows, caption } = spec.table(tab);
    tableBox.innerHTML = `<table>${caption ? `<caption>${caption}</caption>` : ''}<thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${c}</th>` : `<td>${c}</td>`)).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function draw(animate) {
    width = Math.max(260, Math.round(body.clientWidth));
    const h = spec.height(width, tab, compact);
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${width} ${h}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', h);
    tl?.kill();
    tl = spec.render({ svg, width, height: h, tab, compact, theme }) || null;
    if (tl) {
      if (animate && !reducedMotion) tl.play(0);
      else if (introDone) tl.progress(1);
      else tl.pause(0);
    }
    const f = typeof spec.foot === 'function' ? spec.foot(tab) : spec.foot;
    foot.innerHTML = f || '';
    foot.hidden = !f;
    renderTable();
  }

  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    tab = Number(b.dataset.tab);
    root.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    draw(true);
  }));
  root.querySelector('.rc__toggle')?.addEventListener('click', (e) => {
    const open = tableBox.hidden;
    tableBox.hidden = !open;
    e.currentTarget.setAttribute('aria-expanded', String(open));
    e.currentTarget.textContent = open ? 'Hide table' : 'Data table';
  });

  draw(false);
  let lastW = width;
  const ro = new ResizeObserver(() => {
    const w = Math.round(body.clientWidth);
    if (Math.abs(w - lastW) < 4) return;
    lastW = w;
    draw(false);
  });
  ro.observe(body);

  return {
    play() {
      if (!introDone) { introDone = true; tl?.play(0); }
    },
    pause() {},
    destroy() { ro.disconnect(); tl?.kill(); root.remove(); },
  };
}

/** Standard intro: fade/rise a selection, used when a chart has nothing more specific. */
export function introTimeline() {
  return gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
}

export { gsap };
