import { mountProductBands } from '../products/bands.js';
import { initSite, gsap, ScrollTrigger, reducedMotion } from '../lib/site.js';
import '../styles/pages/products.css';

mountProductBands({
  current: 'g1',
  title: 'A new body, <em>the same brain.</em>',
  body: '<p>The Semantic Autonomy Stack separates the body from everything above it. Its platform layer can be differential-drive, omnidirectional, Ackermann, quadruped or humanoid; the reasoning, mission and memory layers are designed to stay the same.</p>',
  layers: {
    L5: { note: 'Shared memory across robots', tag: 'Body-agnostic', state: 'plan' },
    L4: { note: 'Natural-language missions', tag: 'Body-agnostic', state: 'plan' },
    L3: { note: 'Semantic reasoning over the map', tag: 'Body-agnostic', state: 'plan' },
    L2: { note: 'Object identity and affordance, not just geometry' },
    L1: { note: 'Executed with the body’s own motion capabilities', state: 'adapt', tag: 'Per body' },
    L0: { note: 'Bipedal humanoid: 43 DOF, two dexterous hands', tag: 'G1' },
  },
  ctaTitle: 'See FIIRION <em>at work.</em>',
  subject: 'SAIM G1 FIIRION',
});

initSite();

/* ---------- Hero ---------- */
if (!reducedMotion) {
  gsap.from('.g1-hero__line', { yPercent: 110, opacity: 0, duration: 1.4, stagger: 0.12, ease: 'expo.out', delay: 0.2 });
  gsap.from('.g1-hero__figure .g1-scan', { y: 80, opacity: 0, duration: 1.8, ease: 'expo.out', delay: 0.1 });
  gsap.from('.g1-hero__tele > div', { x: 20, opacity: 0, duration: 1, stagger: 0.08, delay: 0.9 });
  gsap.to('.g1-hero__word', { xPercent: -12, ease: 'none', scrollTrigger: { trigger: '.g1-hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.g1-hero__figure .g1-scan', { yPercent: 8, ease: 'none', scrollTrigger: { trigger: '.g1-hero', start: 'top top', end: 'bottom top', scrub: true } });
}

/* ---------- Anatomy ---------- */
// Points are in the image's pixel space (526 × 1172). Labels sit outside the silhouette.
const JOINTS = [[180, 275], [420, 292], [62, 355], [452, 432], [310, 540], [255, 640], [385, 640], [215, 880], [405, 880], [190, 1062], [420, 1052]];
const GROUPS = [
  { step: 1, dots: [[300, 140]], label: { x: 600, y: 140, text: 'Head · perception + interaction' } },
  { step: 2, dots: [[110, 72]], label: { x: 600, y: 22, text: 'Dexterous hand', near: true } },
  { step: 2, dots: [[486, 590]], label: { x: 600, y: 590, text: 'Dexterous hand' } },
  { step: 3, dots: JOINTS, label: { x: 600, y: 470, text: '43 degrees of freedom', from: 3 } },
  { step: 4, dots: [[215, 880], [405, 880], [190, 1062], [420, 1052]], label: { x: 600, y: 960, text: 'Dynamic balance', from: 1 } },
];
const STEPS = 6;
const SVGNS = 'http://www.w3.org/2000/svg';

const section = document.querySelector('.g1-anat');
const figure = section.querySelector('.g1-figure');
const leads = figure.querySelector('.g1-leads');
const dotsLayer = figure.querySelector('.g1-dots');
const labels = figure.querySelector('.g1-labels');
const steps = [...section.querySelectorAll('.g1-step')];
const readRows = [...section.querySelectorAll('[data-read]')];

// Build hotspots, leader lines and labels from the data above.
GROUPS.forEach((g) => {
  g.dots.forEach(([x, y], di) => {
    const c = document.createElementNS(SVGNS, 'g');
    c.setAttribute('class', 'g1-dot');
    c.dataset.step = g.step;
    c.style.setProperty('--d', `${di * 0.06}s`);
    c.innerHTML = `<circle cx="${x}" cy="${y}" r="16" class="g1-dot__ring"/><circle cx="${x}" cy="${y}" r="5" class="g1-dot__core"/>`;
    dotsLayer.appendChild(c);
  });
  const [sx, sy] = g.dots[g.label.from ?? 0];
  const { x, y, left, near } = g.label;
  // The bend sits next to the label, or next to the dot when the line must clear the head.
  const elbowX = near ? sx + 30 : left ? x + 30 : x - 30;
  const p = document.createElementNS(SVGNS, 'path');
  p.setAttribute('d', `M${sx},${sy} L${elbowX},${y} L${x},${y}`);
  p.setAttribute('pathLength', '1');
  p.setAttribute('class', 'g1-lead');
  p.dataset.step = g.step;
  leads.appendChild(p);
  const l = document.createElement('span');
  l.className = `g1-label mono${left ? ' is-left' : ''}`;
  l.dataset.step = g.step;
  l.style.left = `${(x / 526) * 100}%`;
  l.style.top = `${(y / 1172) * 100}%`;
  l.textContent = g.label.text;
  labels.appendChild(l);
});

const fmt = (row, v) => {
  const b = row.querySelector('b');
  const dec = Number(b.dataset.dec || 0);
  b.textContent = v.toFixed(dec) + (b.dataset.suf || '');
};
const counters = readRows.map((row) => ({ row, step: Number(row.dataset.read), end: Number(row.querySelector('b').dataset.val), o: { v: 0 }, on: false }));

let currentStep = -1;
function setStep(i) {
  if (i === currentStep) return;
  currentStep = i;
  steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
  figure.querySelectorAll('[data-step]').forEach((el) => {
    const s = Number(el.dataset.step);
    el.classList.toggle('is-on', s === i);
    el.classList.toggle('is-past', s < i);
  });
  figure.classList.toggle('show-dim', i >= 0);
  counters.forEach((c) => {
    const on = i >= c.step;
    if (on === c.on) return;
    c.on = on;
    c.row.classList.toggle('is-on', on);
    gsap.to(c.o, { v: on ? c.end : 0, duration: on ? 1.2 : 0.4, ease: 'power3.out', onUpdate: () => fmt(c.row, c.o.v) });
  });
  section.querySelector('.g1-gauge__fill').classList.toggle('is-on', i >= 5);
}

const mm = gsap.matchMedia();
mm.add({ pinned: '(min-width: 961px) and (min-height: 620px) and (prefers-reduced-motion: no-preference)' }, (ctx) => {
  if (!ctx.conditions.pinned) {
    // Static, complete version: every hotspot on, numbered list of steps below the figure.
    section.classList.add('is-static');
    figure.querySelectorAll('[data-step]').forEach((el) => el.classList.add('is-on'));
    figure.classList.add('show-dim');
    counters.forEach((c) => fmt(c.row, c.end));
    return () => section.classList.remove('is-static');
  }
  section.classList.add('is-pinned');
  setStep(0);
  const st = ScrollTrigger.create({
    trigger: section.querySelector('.g1-anat__pin'),
    start: 'top top',
    end: `+=${STEPS * 70}%`,
    pin: true,
    anticipatePin: 1,
    onUpdate: (self) => {
      section.style.setProperty('--scan', self.progress.toFixed(4));
      setStep(Math.min(STEPS - 1, Math.floor(self.progress * STEPS)));
    },
  });
  return () => { st.kill(); section.classList.remove('is-pinned'); };
});
