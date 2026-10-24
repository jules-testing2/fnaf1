import { mountProductBands } from '../products/bands.js';
import { initSite, gsap, ScrollTrigger, reducedMotion, isTouch } from '../lib/site.js';
import { renderThermalPair, IRONBOW_CSS } from '../products/thermal.js';
import '../styles/pages/products.css';

mountProductBands({
  current: 'go2',
  title: 'Next: the stack <em>on four legs.</em>',
  body: '<p>The lab’s VLM paper names the Unitree Go2 quadruped, equipped with 3D LiDAR and depth sensing, as the planned validation target for platform portability. The question it tests: can the reasoning and memory layers be reused with minimal modification once navigation and perception are adapted to the new body?</p>',
  layers: {
    L5: { note: 'Operational intelligence and memory', tag: 'Reuse', state: 'plan' },
    L4: { note: 'Mission interface', tag: 'Reuse', state: 'plan' },
    L3: { note: 'Resolver + VLM reasoning', tag: 'Reuse', state: 'plan' },
    L2: { note: 'Semantic perception outputs · 3D LiDAR + depth', tag: 'Adapt', state: 'adapt' },
    L1: { note: 'Navigation interface for legged motion', tag: 'Adapt', state: 'adapt' },
    L0: { note: 'Unitree Go2 quadruped', tag: 'Planned target' },
  },
  ctaTitle: 'Send FIIRIDOG <em>where wheels stop.</em>',
  subject: 'SAIM Go2 FIIRIDOG',
});

initSite();

/* ---------- Hero: terrain layers drift at different depths ---------- */
const layers = gsap.utils.toArray('.go-terrain__layer');
if (!reducedMotion) {
  gsap.from('.go-hero__line', { yPercent: 110, opacity: 0, duration: 1.4, stagger: 0.12, ease: 'expo.out', delay: 0.2 });
  gsap.from('.go-hero__dog img', { x: 160, opacity: 0, duration: 1.8, ease: 'expo.out', delay: 0.25 });
  gsap.from(layers, { yPercent: 30, opacity: 0, duration: 1.6, stagger: 0.1, ease: 'expo.out' });
  layers.forEach((l) => {
    const d = Number(l.dataset.depth);
    gsap.to(l, { yPercent: -d * 40, ease: 'none', scrollTrigger: { trigger: '.go-hero', start: 'top top', end: 'bottom top', scrub: true } });
  });
  gsap.to('.go-hero__dog', { yPercent: -10, ease: 'none', scrollTrigger: { trigger: '.go-hero', start: 'top top', end: 'bottom top', scrub: true } });
  if (!isTouch) {
    const movers = layers.map((l) => gsap.quickTo(l, 'x', { duration: 1.2, ease: 'power3.out' }));
    const dog = gsap.quickTo('.go-hero__dog img', 'x', { duration: 1.4, ease: 'power3.out' });
    document.querySelector('.go-hero').addEventListener('pointermove', (e) => {
      const k = e.clientX / window.innerWidth - 0.5;
      movers.forEach((m, i) => m(-k * 60 * Number(layers[i].dataset.depth)));
      dog(k * 18);
    });
  }
}

/* ---------- RGB vs thermal split view ---------- */
const stage = document.querySelector('.go-vision__stage');
const ir = stage.querySelector('.go-vision__ir');
const range = stage.querySelector('.go-vision__range');
const viewButtons = [...document.querySelectorAll('[data-view]')];
const split = { v: 50 };
stage.querySelector('.go-vision__scale i').style.background = IRONBOW_CSS;

function applySplit() {
  // Thermal covers the right-hand `v` percent of the image.
  const v = split.v;
  ir.style.clipPath = `inset(0 0 0 ${100 - v}%)`;
  stage.style.setProperty('--split', `${100 - v}%`);
  range.value = String(Math.round(v));
  viewButtons.forEach((b) => b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.view) - v) < 1)));
}
function setSplit(v, animate = true) {
  gsap.to(split, { v, duration: animate && !reducedMotion ? 0.9 : 0, ease: 'expo.out', onUpdate: applySplit });
}
applySplit();
range.addEventListener('input', () => { gsap.killTweensOf(split); split.v = Number(range.value); applySplit(); });
viewButtons.forEach((b) => b.addEventListener('click', () => setSplit(Number(b.dataset.view))));
stage.addEventListener('pointermove', (e) => {
  if (isTouch && e.pointerType !== 'mouse' && !e.buttons) return;
  const r = stage.getBoundingClientRect();
  gsap.killTweensOf(split);
  split.v = gsap.utils.clamp(0, 100, 100 - ((e.clientX - r.left) / r.width) * 100);
  applySplit();
});

const dogImg = new Image();
dogImg.src = 'img/go2.webp';
const [rgbCanvas, irCanvas] = stage.querySelectorAll('canvas');
const paint = () => dogImg.complete && dogImg.naturalWidth && renderThermalPair(dogImg, rgbCanvas, irCanvas);
dogImg.decode().then(paint).catch(() => {});
new ResizeObserver(() => paint()).observe(stage);
// A sweep on first view shows that the divider moves.
if (!reducedMotion) {
  ScrollTrigger.create({
    trigger: stage, start: 'top 70%', once: true,
    onEnter: () => gsap.timeline().to(split, { v: 85, duration: 1.1, ease: 'power2.inOut', onUpdate: applySplit }).to(split, { v: 50, duration: 1.2, ease: 'expo.out', onUpdate: applySplit }),
  });
}

/* ---------- Patrol loop ---------- */
const svg = document.querySelector('.go-map svg');
const route = svg.querySelector('.go-route');
const dog = svg.querySelector('.go-dog');
const clock = document.querySelector('[data-clock]');
const cpLayer = svg.querySelector('.go-checkpoints');
const legs = [...document.querySelectorAll('.go-legs li')];
const total = route.getTotalLength();
const PATROL_S = 3 * 3600; // three hours of continuous patrol, compressed into one loop

// Faint map grid.
const grid = svg.querySelector('.go-map__grid');
for (let x = 0; x <= 800; x += 40) grid.insertAdjacentHTML('beforeend', `<line x1="${x}" y1="0" x2="${x}" y2="520"/>`);
for (let y = 0; y <= 520; y += 40) grid.insertAdjacentHTML('beforeend', `<line x1="0" y1="${y}" x2="800" y2="${y}"/>`);

// Each checkpoint sits on the route point nearest its zone centre.
const ZONES = { stairs: [120, 135], rubble: [460, 100], crawl: [670, 175], equip: [530, 390], yard: [160, 365] };
const cps = Object.entries(ZONES).map(([id, [zx, zy]]) => {
  let best = 0, bestD = Infinity;
  for (let s = 0; s <= total; s += 4) {
    const p = route.getPointAtLength(s);
    const d = (p.x - zx) ** 2 + (p.y - zy) ** 2;
    if (d < bestD) { bestD = d; best = s; }
  }
  const p = route.getPointAtLength(best);
  cpLayer.insertAdjacentHTML('beforeend', `<g class="go-cp" data-cp="${id}" transform="translate(${p.x} ${p.y})"><circle r="14" class="go-cp__ring"/><circle r="5" class="go-cp__dot"/></g>`);
  return { id, at: best / total, el: cpLayer.lastElementChild, zone: svg.querySelector(`[data-zone="${id}"]`), leg: legs.find((l) => l.dataset.cp === id) };
});

const pad = (n) => String(Math.floor(n)).padStart(2, '0');
function placeDog(t) {
  const s = (t % 1) * total;
  const p = route.getPointAtLength(s);
  const q = route.getPointAtLength((s + 2) % total);
  const ang = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
  dog.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${ang})`);
  const secs = (t % 1) * PATROL_S;
  clock.textContent = `${pad(secs / 3600)}:${pad((secs % 3600) / 60)}:${pad(secs % 60)}`;
  route.style.strokeDashoffset = String(total * (1 - (t % 1)));
  // The most recently passed checkpoint is "active"; the ones behind it are done.
  let active = null;
  cps.forEach((c) => { if ((t % 1) >= c.at) active = c; });
  cps.forEach((c) => {
    const on = c === active;
    c.el.classList.toggle('is-on', on);
    c.el.classList.toggle('is-done', (t % 1) >= c.at && !on);
    c.zone?.classList.toggle('is-on', on);
    c.leg?.classList.toggle('is-on', on);
  });
}
route.style.strokeDasharray = String(total);
const patrol = { t: 0 };
if (reducedMotion) {
  route.style.strokeDasharray = 'none';
  placeDog(0.02);
} else {
  placeDog(0);
  const loop = gsap.to(patrol, { t: 1, duration: 24, ease: 'none', repeat: -1, paused: true, onUpdate: () => placeDog(patrol.t) });
  ScrollTrigger.create({ trigger: '.go-map', start: 'top bottom', end: 'bottom top', onToggle: (self) => (self.isActive ? loop.play() : loop.pause()) });
}
