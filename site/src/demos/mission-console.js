// L4 → L3 → L1/L2 → L5 · an operator console where each natural-language mission flows through the stack.
//
// The terminal types an instruction, then logs every layer it touches: the negation guard, the L3a steps,
// escalation to L3b when the cascade abstains, destination validation by the executive contract ⟨A,O,V,L⟩,
// Nav2 execution, post-arrival confirmation and the L5 audit record. A schematic map shows the robot driving
// to the resolved node. Missions are illustrative; routing follows the published frozen v4.8-review algorithm.
//
// Emits a bubbling "sas:trace" CustomEvent ({ detail: { stage, path } }) at each stage, so a page can
// light up a matching flow diagram. Stages: instruction, preprocess, guard, step0, steps, location, l3b,
// prompt, vlm, validate, contract, route, confirm, audit.
// Options: bare, compact, theme, map (default true). Returns { play, pause, destroy }.

import gsap from 'gsap';
import { buildFrame, h } from './reasoning/frame.js';
import { NODES, EDGES, PLANTS, shortestPath, nearestOf } from './reasoning/corridor-graph.js';
import { STEPS } from './reasoning/sas-data.js';

const VLM_S = 7.2;     // median VLM-path wall time of the control model in the paper's offline replay
const PLAYBACK = 2;    // the wait is shown at 2x so the loop stays watchable
const SPEED = 150;     // map units per second for the robot dot

const nodeLabel = (id) => `node ${id}${NODES[id].name ? ` ${NODES[id].name}` : ''}`;

// Each mission returns its log as data. `stage` drives the external flow diagram.
const MISSIONS = [
  {
    text: 'go to lab cb204',
    plan: () => ({ kind: 'det', step: 2, target: 5, value: 'cb204 → node 5', confirm: 'landmark · confirmed' }),
  },
  {
    text: 'It is too hot in here, take me somewhere I can get some fresh air',
    plan: () => ({ kind: 'det', step: 0, target: 14, value: 'stored association → node 14', confirm: 'landmark · confirmed' }),
  },
  {
    text: 'take me somewhere I can sit and relax',
    plan: () => ({ kind: 'vlm', why: 'no_deterministic_match', target: 9, reply: '{"node_id": 9, "reason": "radiator_main: seating, resting spot"}', confirm: 'landmark · confirmed' }),
  },
  {
    text: 'take me to the closest plant',
    plan: (from) => { const n = nearestOf(from, PLANTS); return { kind: 'det', step: 6, target: n, value: `plant → ${nodeLabel(n)}`, confirm: 'landmark · confirmed' }; },
  },
  {
    text: 'take me to a plant, but not the one by the north window',
    plan: (from) => {
      const n = nearestOf(from, PLANTS.filter((p) => p !== 14 && p !== from));
      return { kind: 'neg', why: 'negation_detected', forbidden: 14, target: n, reply: `{"node_id": ${n}, "reason": "potted plant away from the north window"}`, confirm: 'landmark · confirmed' };
    },
  },
];

function logLines(plan) {
  const L = [];
  const add = (layer, text, value = '', o = {}) => L.push({ layer, text, value, ...o });
  add('L4', 'instruction accepted', 'platform xplorer-b', { stage: 'instruction' });
  add('L3', 'preprocess', 'normalize · tokenize · aliases', { stage: 'preprocess' });
  if (plan.kind === 'neg') {
    add('L3a', 'negation / exclusion guard', 'detected · skip S0–S6', { cls: 'warn', stage: 'guard' });
    add('L3', 'escalate → L3b', `negation_detected · forbidden {${plan.forbidden}}`, { cls: 'warn', stage: 'l3b' });
  } else {
    add('L3a', 'negation / exclusion guard', 'clear', { stage: 'guard' });
    const last = plan.kind === 'det' ? plan.step : 6;
    for (let i = 0; i <= last; i++) {
      const hit = plan.kind === 'det' && i === plan.step;
      add('L3a', `${STEPS[i].id} ${STEPS[i].name.toLowerCase()}`, hit ? plan.value : i === 0 ? 'abstain' : '–', { cls: hit ? 'hit' : 'dim', stage: i === 0 ? 'step0' : 'steps', fast: true });
    }
    if (plan.kind === 'det') {
      add('L3a', 'location referent', 'consistent', { stage: 'location', fast: true });
      add('L3a', 'resolver compute', '< 1 ms · no model call', { cls: 'hit' });
    } else {
      add('L3', 'escalate → L3b', plan.why, { cls: 'warn', stage: 'l3b' });
    }
  }
  if (plan.kind !== 'det') {
    add('L3b', 'multimodal prompt', plan.kind === 'neg' ? 'graph · objects · memory · negation notice' : 'graph · objects · memory prefix', { stage: 'prompt' });
    add('L3b', 'VLM qwen3.5:4b', '', { vlm: true, stage: 'vlm' });
    add('L3b', 'reply', plan.reply, { cls: 'code' });
    add('L3b', 'destination validation', plan.kind === 'neg' ? `node ${plan.target} not forbidden · pass` : 'valid node · pass', { cls: 'hit', stage: 'validate' });
  }
  add('L3', 'executive contract ⟨A,O,V,L⟩', 'admissible goal', { stage: 'contract' });
  add('L1', 'Nav2 route', `→ ${nodeLabel(plan.target)}`, { stage: 'route', drive: true });
  add('L1', 'arrived', nodeLabel(plan.target), { cls: 'hit' });
  add('L3', 'post-arrival confirmation', plan.confirm, { stage: 'confirm' });
  add('L5', 'audit record', 'M5 task history · platform-tagged', { stage: 'audit' });
  return L;
}

export default function mount(el, { options = {}, reducedMotion }) {
  const showMap = options.map !== false;
  const { root, body } = buildFrame(el, {
    title: 'L4 · mission console',
    label: 'Animated operator console. Natural-language missions are typed, then each stack layer logs its part: guard, deterministic resolver steps, escalation to the VLM when needed, validation, Nav2 execution, confirmation and an audit record. A schematic map shows the robot driving to the resolved node.',
    legend: '<span class="rz-chip rz-chip--fire">L3a</span><span class="rz-chip rz-chip--violet">L3b</span><span class="rz-chip rz-chip--mint">L1</span>',
    options,
    cls: 'mc',
  });

  const out = h('ol.mc-log', { 'aria-hidden': 'true' });
  const typed = h('span.mc-typed');
  const promptLine = h('div.mc-prompt.mono', h('span.mc-ps', 'operator@sas:~$ '), h('span', 'mission "'), typed, h('span.mc-q', '"'), h('i.mc-caret'));
  const term = h('section.mc-term', h('div.mc-term__bar', h('i'), h('i'), h('i'), h('span.mono', 'sas · workstation · xplorer-b')), h('div.mc-term__screen', out, promptLine));

  // ---- Mini map (SVG) ----
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 404 260');
  svg.setAttribute('class', 'mc-map__svg');
  const pathD = (ids) => ids.map((id, i) => `${i ? 'L' : 'M'}${NODES[id].x} ${NODES[id].y}`).join(' ');
  svg.innerHTML = `
    <rect x="6" y="18" width="392" height="232" rx="14" class="mc-floor"/>
    ${EDGES.map(([a, b]) => `<line x1="${NODES[a].x}" y1="${NODES[a].y}" x2="${NODES[b].x}" y2="${NODES[b].y}" class="mc-edge"/>`).join('')}
    <path class="mc-route" d=""/>
    ${NODES.map((n) => `<g class="mc-node ${n.name ? 'is-poi' : ''}" data-id="${n.id}" transform="translate(${n.x} ${n.y})"><circle r="${n.name ? 5 : 3}"/>${n.name ? `<text y="${n.y < 60 ? -10 : 16}" text-anchor="middle">${n.name}</text>` : ''}</g>`).join('')}
    <g class="mc-robot"><circle r="11" class="mc-robot__halo"/><circle r="6" class="mc-robot__core"/></g>`;
  const route = svg.querySelector('.mc-route');
  const robotG = svg.querySelector('.mc-robot');
  const nodeEls = [...svg.querySelectorAll('.mc-node')];
  const mapCap = h('div.mc-map__cap.mono', h('span', 'schematic route graph · not to scale'), h('span.mc-map__status', 'idle'));
  const map = h('section.mc-map', svg, mapCap);
  const status = mapCap.querySelector('.mc-map__status');

  body.append(h('div.mc-grid' + (showMap ? '' : '.mc-grid--solo'), term, showMap ? map : null));

  // ---- State ----
  let at = 1; // robot node
  let idx = 0;
  let tl = null;
  const robotPos = { x: NODES[at].x, y: NODES[at].y };
  const placeRobot = () => robotG.setAttribute('transform', `translate(${robotPos.x} ${robotPos.y})`);
  placeRobot();

  const trace = (stage, extra = {}) => el.dispatchEvent(new CustomEvent('sas:trace', { bubbles: true, detail: { stage, ...extra } }));

  const appendLine = (l) => {
    const valueEl = h('span.mc-v', l.value);
    const li = h(`li.mc-line.is-${l.layer.toLowerCase()}${l.cls ? `.is-${l.cls}` : ''}`, h('b', l.layer), h('span.mc-t', l.text), valueEl);
    out.append(li);
    while (out.children.length > 22) out.firstElementChild.remove();
    out.parentElement.scrollTop = out.parentElement.scrollHeight;
    return valueEl;
  };

  function drive(t, path, startAt) {
    const pts = path.map((id) => NODES[id]);
    const seg = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
    const total = seg.reduce((a, b) => a + b, 0) || 1;
    const dur = Math.max(0.6, total / SPEED);
    const prog = { d: 0 };
    t.call(() => { route.setAttribute('d', pathD(path)); route.classList.add('is-on'); status.textContent = 'executing'; }, null, startAt);
    t.to(prog, {
      d: total, duration: dur, ease: 'power1.inOut',
      onUpdate: () => {
        let d = prog.d, i = 0;
        while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
        const a = pts[i], b = pts[i + 1] || a, f = seg[i] ? Math.min(1, d / seg[i]) : 1;
        robotPos.x = a.x + (b.x - a.x) * f; robotPos.y = a.y + (b.y - a.y) * f;
        placeRobot();
      },
    }, startAt);
    return dur;
  }

  function build() {
    const m = MISSIONS[idx % MISSIONS.length];
    idx++;
    const plan = m.plan(at);
    const lines = logLines(plan);
    const path = shortestPath(at, plan.target);
    const t = gsap.timeline({ onComplete: () => { tl = build(); } });

    t.call(() => {
      out.innerHTML = '';
      typed.textContent = '';
      route.classList.remove('is-on');
      nodeEls.forEach((n) => n.classList.remove('is-target', 'is-forbidden'));
      status.textContent = 'idle';
      root.classList.add('is-typing');
      trace('idle');
    }, null, 0);

    const chars = { n: 0 };
    const typeDur = Math.min(2.2, m.text.length * 0.04);
    t.to(chars, { n: m.text.length, duration: typeDur, ease: 'none', onUpdate: () => (typed.textContent = m.text.slice(0, Math.round(chars.n))) }, 0.4);
    let s = 0.4 + typeDur + 0.35;
    t.call(() => { root.classList.remove('is-typing'); appendLine({ layer: '$', text: `mission "${m.text}"`, value: '', cls: 'cmd' }); typed.textContent = ''; }, null, s);
    s += 0.25;

    for (const l of lines) {
      if (l.stage === 'route') {
        t.call(() => {
          trace('route');
          appendLine(l);
          nodeEls[plan.target].classList.add('is-target');
        }, null, s);
        s += drive(t, path, s + 0.1) + 0.2;
        t.call(() => { status.textContent = 'arrived'; at = plan.target; }, null, s);
        continue;
      }
      if (l.vlm) {
        let valueEl;
        t.call(() => { trace('vlm'); valueEl = appendLine({ ...l, cls: 'busy', value: '0.0 s' }); status.textContent = 'waiting for VLM'; }, null, s);
        const v = { s: 0 };
        const wait = VLM_S / PLAYBACK;
        t.to(v, { s: VLM_S, duration: wait, ease: 'none', onUpdate: () => { if (valueEl) valueEl.textContent = `${v.s.toFixed(1)} s${v.s < VLM_S ? ' …' : ''}`; } }, s);
        t.call(() => valueEl?.parentElement.classList.remove('is-busy'), null, s + wait);
        s += wait + 0.3;
        continue;
      }
      t.call(() => {
        if (l.stage) trace(l.stage, { kind: plan.kind });
        appendLine(l);
        if (l.stage === 'l3b' && plan.forbidden != null) nodeEls[plan.forbidden].classList.add('is-forbidden');
      }, null, s);
      s += l.fast ? 0.12 : 0.42;
    }
    t.to({}, { duration: 2.6 }, s);
    return t;
  }

  function staticFrame() {
    const m = MISSIONS[2];
    const plan = m.plan(1);
    logLines(plan).forEach((l) => appendLine(l.vlm ? { ...l, value: `${VLM_S} s` } : l));
    const path = shortestPath(1, plan.target);
    route.setAttribute('d', pathD(path));
    route.classList.add('is-on');
    nodeEls[plan.target].classList.add('is-target');
    Object.assign(robotPos, { x: NODES[plan.target].x, y: NODES[plan.target].y });
    placeRobot();
    typed.textContent = m.text;
    status.textContent = 'arrived';
  }

  if (reducedMotion) staticFrame();

  return {
    play() { if (reducedMotion) return; if (!tl) tl = build(); else tl.resume(); },
    pause() { tl?.pause(); },
    destroy() { tl?.kill(); },
  };
}
