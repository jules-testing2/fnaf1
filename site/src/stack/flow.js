// Live version of the paper's Fig. 2 (frozen v4.8-review reasoning flow) as an SVG.
// It listens for "sas:trace" events from the mission-console demo and lights the node for each stage,
// plus the edge that led there, so visitors see which branch an instruction takes.

import { gsap, reducedMotion } from '../lib/motion.js';

const NODES = {
  instruction: { x: 150, y: 26, w: 220, label: 'Natural-language instruction' },
  preprocess: { x: 150, y: 80, w: 220, label: 'Text preprocessing' },
  guard: { x: 150, y: 140, w: 170, label: 'Negation or exclusion?', diamond: true },
  step0: { x: 150, y: 202, w: 220, label: 'S0 · reuse learned association', tone: 'fire' },
  steps: { x: 150, y: 252, w: 220, label: 'S1–S6 · deterministic cascade', tone: 'fire' },
  location: { x: 150, y: 312, w: 170, label: 'Location consistent?', diamond: true },
  l3b: { x: 376, y: 202, w: 150, label: 'L3b escalation', tone: 'vlm' },
  prompt: { x: 376, y: 252, w: 150, label: 'Multimodal prompt', tone: 'vlm' },
  vlm: { x: 376, y: 302, w: 150, label: 'VLM inference', tone: 'vlm' },
  validate: { x: 376, y: 352, w: 150, label: 'Destination validation', tone: 'ok' },
  clarify: { x: 376, y: 412, w: 150, label: 'Clarification', tone: 'ok' },
  contract: { x: 150, y: 382, w: 220, label: 'Executive contract ⟨A,O,V,L⟩' },
  route: { x: 150, y: 432, w: 220, label: 'Route + Nav2 execution', tone: 'mint' },
  confirm: { x: 150, y: 482, w: 220, label: 'Post-arrival confirmation' },
  audit: { x: 150, y: 536, w: 220, label: 'Audit record · L5', tone: 'violet' },
};

// [from, to]. Elbow routes are computed from node centres; branch labels are placed by hand below.
const EDGES = [
  ['instruction', 'preprocess'], ['preprocess', 'guard'], ['guard', 'step0'], ['guard', 'l3b'],
  ['step0', 'steps'], ['steps', 'location'], ['steps', 'l3b'], ['location', 'contract'],
  ['location', 'l3b'], ['l3b', 'prompt'], ['prompt', 'vlm'], ['vlm', 'validate'],
  ['validate', 'contract'], ['validate', 'clarify'], ['clarify', 'audit'],
  ['contract', 'route'], ['route', 'confirm'], ['confirm', 'audit'],
];

const H = 30;
function edgePath(a, b) {
  const A = NODES[a], B = NODES[b];
  if (Math.abs(A.x - B.x) < 2) return `M${A.x} ${A.y + H / 2} V${B.y - H / 2}`;
  if (B.x > A.x) { // branch right into the L3b column
    return B.y <= A.y + 2 ? `M${A.x + A.w / 2} ${A.y} H${B.x - B.w / 2}` : `M${A.x + A.w / 2} ${A.y} H${B.x} V${B.y - H / 2}`;
  }
  // back left from the L3b column into the main spine
  return B.y > A.y + 40 ? `M${A.x} ${A.y + H / 2} V${B.y} H${B.x + B.w / 2}` : `M${A.x - A.w / 2} ${A.y} H${B.x + B.w / 2}`;
}
// Two right-hand branches would share a corridor; give them distinct lanes.
const OVERRIDES = {
  'guard-l3b': () => `M${NODES.guard.x + 85} ${NODES.guard.y} H${NODES.l3b.x} V${NODES.l3b.y - H / 2}`,
  'steps-l3b': () => `M${NODES.steps.x + 110} ${NODES.steps.y} H${NODES.l3b.x - 90} V${NODES.l3b.y + 4} H${NODES.l3b.x - 75}`,
  'location-l3b': () => `M${NODES.location.x + 85} ${NODES.location.y} H${NODES.l3b.x - 100} V${NODES.l3b.y + 10} H${NODES.l3b.x - 75}`,
  'validate-contract': () => `M${NODES.validate.x - 75} ${NODES.validate.y} H${NODES.contract.x + 140} V${NODES.contract.y} H${NODES.contract.x + 110}`,
  'clarify-audit': () => `M${NODES.clarify.x} ${NODES.clarify.y + H / 2} V${NODES.audit.y} H${NODES.audit.x + 110}`,
};

export function mountFlow(host, source) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 460 560');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Reasoning flow: instruction, text preprocessing, negation guard, Step 0 and Steps 1 to 6 of the deterministic resolver, location check, or escalation to the VLM with prompt, inference and destination validation; then the executive contract, route execution, post-arrival confirmation and an audit record.');

  const edges = EDGES.map(([a, b]) => {
    const key = `${a}-${b}`;
    return { key, d: (OVERRIDES[key] || (() => edgePath(a, b)))() };
  });

  svg.innerHTML = `
    <defs><marker id="flow-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" class="flow-arrowhead"/></marker></defs>
    <rect x="22" y="174" width="256" height="166" rx="14" class="flow-group flow-group--fast"/>
    <text x="34" y="190" class="flow-group__label">L3a · deterministic resolver</text>
    <rect x="290" y="174" width="168" height="270" rx="14" class="flow-group flow-group--slow"/>
    <text x="302" y="190" class="flow-group__label">L3b</text>
    ${edges.map((e) => `<path d="${e.d}" class="flow-edge" data-edge="${e.key}" marker-end="url(#flow-arrow)"/>`).join('')}
    ${Object.entries(NODES).map(([k, n]) => n.diamond
      ? `<g class="flow-node is-diamond" data-node="${k}"><path d="M${n.x} ${n.y - 20}L${n.x + n.w / 2} ${n.y}L${n.x} ${n.y + 20}L${n.x - n.w / 2} ${n.y}Z"/><text x="${n.x}" y="${n.y + 4}">${n.label}</text></g>`
      : `<g class="flow-node ${n.tone ? `tone-${n.tone}` : ''}" data-node="${k}"><rect x="${n.x - n.w / 2}" y="${n.y - H / 2}" width="${n.w}" height="${H}" rx="8"/><text x="${n.x}" y="${n.y + 4}">${n.label}</text></g>`).join('')}
    <circle r="5" class="flow-pulse"/>`;

  // Small branch labels placed by hand where they read best.
  const LABELS = [
    ['no', 160, 168], ['yes', 238, 132], ['abstain', 160, 230], ['no match', 268, 245],
    ['conflict', 238, 305], ['yes', 160, 346], ['pass', 268, 374], ['block', 386, 384],
  ];
  LABELS.forEach(([t, x, y]) => {
    const el = document.createElementNS(NS, 'text');
    el.setAttribute('x', x); el.setAttribute('y', y); el.setAttribute('class', 'flow-branch');
    el.textContent = t;
    svg.appendChild(el);
  });
  host.appendChild(svg);

  const nodeEls = Object.fromEntries([...svg.querySelectorAll('[data-node]')].map((g) => [g.dataset.node, g]));
  const edgeEls = Object.fromEntries([...svg.querySelectorAll('[data-edge]')].map((p) => [p.dataset.edge, p]));
  const pulse = svg.querySelector('.flow-pulse');
  let prev = null;

  function clear() {
    Object.values(nodeEls).forEach((n) => n.classList.remove('is-on', 'is-now'));
    Object.values(edgeEls).forEach((p) => p.classList.remove('is-on'));
    prev = null;
  }

  function light(stage) {
    const node = nodeEls[stage];
    if (!node) return;
    const edge = prev && edgeEls[`${prev}-${stage}`];
    Object.values(nodeEls).forEach((n) => n.classList.remove('is-now'));
    node.classList.add('is-on', 'is-now');
    if (edge) {
      edge.classList.add('is-on');
      if (!reducedMotion) {
        gsap.killTweensOf(pulse);
        gsap.fromTo(pulse, { autoAlpha: 1 }, { motionPath: { path: edge, align: edge, alignOrigin: [0.5, 0.5] }, duration: 0.45, ease: 'power1.inOut', onComplete: () => gsap.to(pulse, { autoAlpha: 0, duration: 0.2 }) });
      }
    }
    prev = stage;
  }

  source.addEventListener('sas:trace', (e) => {
    const { stage } = e.detail || {};
    if (stage === 'idle') clear();
    else light(stage);
  });

  // Static, complete picture before any mission runs (and for reduced motion).
  ['instruction', 'preprocess', 'guard', 'step0', 'steps', 'location', 'contract', 'route', 'confirm', 'audit'].forEach((s) => light(s));
  gsap.set(pulse, { autoAlpha: 0 });
}
