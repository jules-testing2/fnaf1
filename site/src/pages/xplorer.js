import { mountProductBands } from '../products/bands.js';
import { initSite, gsap, ScrollTrigger, reducedMotion } from '../lib/site.js';
import { BUILDS, MAX_PAYLOAD, MAX_RUNTIME, buildFromHash } from '../products/xplorer-builds.js';
import { createEnvBackdrop } from '../products/env-backdrop.js';
import { morphValue } from '../products/morph.js';
import '../styles/pages/products.css';

mountProductBands({
  current: 'xplorer',
  title: 'Validated on Xplorer, <em>layer by layer.</em>',
  body: '<p>Xplorer is where the Semantic Autonomy Stack was built and measured. The lower layers run onboard each robot on a Raspberry Pi 5; the reasoning and memory layers run on an operator workstation and talk to the robot over HTTP and ROS 2 actions.</p>',
  layers: {
    L5: { note: 'Memory M1 to M5, shared across robots', tag: 'B · C' },
    L4: { note: 'Natural-language missions', tag: 'B · C' },
    L3: { note: 'Deterministic resolver + VLM fallback', tag: 'B · C' },
    L2: { note: 'Camera + 2D LiDAR, YOLO26n, ASF', tag: 'A · B · C' },
    L1: { note: 'Nav2: AMCL + EKF, Route Server, MPPI', tag: 'A · B · C' },
    L0: { note: '4WD differential drive, Raspberry Pi 5', tag: 'A · B · C' },
  },
  ctaTitle: 'Put an Xplorer <em>on your floor.</em>',
  subject: 'SAIM Xplorer',
});

initSite();

const byId = Object.fromEntries(BUILDS.map((b) => [b.id, b]));

/* ---------- Hero: the fleet drives in and settles ---------- */
const bots = gsap.utils.toArray('.xp-hero__bot');
if (!reducedMotion) {
  gsap.from(bots, { xPercent: 140, opacity: 0, duration: 1.6, stagger: 0.12, ease: 'expo.out', delay: 0.35 });
  gsap.from('.xp-hero__title', { yPercent: 30, opacity: 0, duration: 1.4, ease: 'expo.out', delay: 0.15 });
  bots.forEach((b, i) => gsap.to(b.querySelector('img'), { y: -6, duration: 2.2 + i * 0.3, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: i * 0.2 }));
  gsap.to('.xp-hero__title', { yPercent: -18, ease: 'none', scrollTrigger: { trigger: '.xp-hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.xp-hero__fleet', { yPercent: 10, ease: 'none', scrollTrigger: { trigger: '.xp-hero', start: 'top top', end: 'bottom top', scrub: true } });
}

/* ---------- Build switcher ---------- */
const tabs = [...document.querySelectorAll('.xp-tab')];
const photos = [...document.querySelectorAll('.xp-stage__photo')];
const panel = document.getElementById('xp-panel');
const ink = document.querySelector('.xp-tabs__ink');
const x = (k) => panel.querySelector(`[data-x="${k}"]`);
const env = createEnvBackdrop(panel.querySelector('.xp-stage__env'), { initial: 'indoor' });
let current = 'a';
let twin = null;

function moveInk(tab, instant) {
  const r = tab.getBoundingClientRect(), p = tab.parentElement.getBoundingClientRect();
  gsap.to(ink, { x: r.left - p.left, width: r.width, duration: instant || reducedMotion ? 0 : 0.6, ease: 'expo.out' });
}

function selectBuild(id, { focus = false, fromTwin = false } = {}) {
  const b = byId[id];
  if (!b) return;
  const prev = current;
  current = id;

  tabs.forEach((t) => {
    const on = t.dataset.build === id;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    if (on) { moveInk(t); if (focus) t.focus(); panel.setAttribute('aria-labelledby', t.id); }
  });

  // Photo crossfade: outgoing slides left and blurs, incoming arrives from the right.
  if (prev !== id) {
    const dir = BUILDS.findIndex((v) => v.id === id) > BUILDS.findIndex((v) => v.id === prev) ? 1 : -1;
    photos.forEach((img) => {
      const on = img.dataset.build === id, was = img.dataset.build === prev;
      img.classList.toggle('is-active', on);
      if (reducedMotion) { gsap.set(img, { opacity: on ? 1 : 0 }); return; }
      if (on) gsap.fromTo(img, { opacity: 0, xPercent: 18 * dir, scale: 0.92, filter: 'blur(8px)' }, { opacity: 1, xPercent: 0, scale: 1, filter: 'blur(0px)', duration: 1.1, ease: 'expo.out' });
      else if (was) gsap.to(img, { opacity: 0, xPercent: -18 * dir, scale: 0.92, filter: 'blur(8px)', duration: 0.6, ease: 'power2.in' });
    });
  }
  env.set(b.env);

  morphValue(x('name'), b.name);
  morphValue(x('tag'), b.tag);
  morphValue(x('letter'), id.toUpperCase());
  morphValue(x('env'), b.rows[2][1]);
  morphValue(x('payload'), `${b.payload} kg`);
  morphValue(x('runtime'), `${b.runtime} h`);
  gsap.to(x('payload-bar'), { scaleX: b.payload / MAX_PAYLOAD, duration: reducedMotion ? 0 : 1.1, ease: 'expo.out' });
  gsap.to(x('runtime-bar'), { scaleX: b.runtime / MAX_RUNTIME, duration: reducedMotion ? 0 : 1.1, ease: 'expo.out' });
  b.rows.forEach(([k, v], i) => { morphValue(x(`row${i}-k`), k); morphValue(x(`row${i}-v`), v); });
  if (!reducedMotion && prev !== id) gsap.fromTo(x('desc'), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.8 });
  x('desc').textContent = b.desc;
  const mail = x('mail');
  mail.textContent = `Request the ${b.name} specs sheet`;
  mail.href = `mailto:contact@saimrobotics.com?subject=${encodeURIComponent(`${b.name} · spec sheet request`)}`;

  if (!fromTwin) syncTwin(id);
}

tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectBuild(t.dataset.build));
  t.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    let next = null;
    if (step) next = tabs[(i + step + tabs.length) % tabs.length];
    if (e.key === 'Home') next = tabs[0];
    if (e.key === 'End') next = tabs[tabs.length - 1];
    if (!next) return;
    e.preventDefault();
    selectBuild(next.dataset.build, { focus: true });
  });
});

// Initial state: bars, ink and any build named in the URL (#b, #xb, #build-b ...).
gsap.set([x('payload-bar'), x('runtime-bar')], { transformOrigin: 'left center', scaleX: 0 });
ScrollTrigger.create({
  trigger: panel, start: 'top 80%', once: true,
  onEnter: () => {
    const b = byId[current];
    gsap.to(x('payload-bar'), { scaleX: b.payload / MAX_PAYLOAD, duration: 1.4, ease: 'expo.out' });
    gsap.to(x('runtime-bar'), { scaleX: b.runtime / MAX_RUNTIME, duration: 1.4, ease: 'expo.out', delay: 0.1 });
  },
});
requestAnimationFrame(() => moveInk(tabs[0], true));
window.addEventListener('resize', () => moveInk(tabs.find((t) => t.dataset.build === current), true));

function openFromHash() {
  const id = buildFromHash();
  if (!id) return;
  selectBuild(id);
  requestAnimationFrame(() => document.getElementById('builds').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' }));
}
// Hero robots and deep links select a build and jump to the switcher.
document.querySelectorAll('.xp-hero__bot').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  history.replaceState(null, '', a.getAttribute('href'));
  selectBuild(a.dataset.build);
  document.getElementById('builds').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
}));
window.addEventListener('hashchange', openFromHash);
openFromHash();

/* ---------- Digital twin (lazy: Three.js loads when the section approaches) ---------- */
const twinHost = document.querySelector('.xp-twin__canvas');
const twinButtons = [...document.querySelectorAll('[data-twin-build]')];
const sensorButtons = [...document.querySelectorAll('[data-sensor]')];
const twinLabel = document.querySelector('[data-twin-label]');
const sensors = { lidar: false, camera: false };

function syncTwin(id) {
  twinButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.twinBuild === id)));
  morphValue(twinLabel, byId[id].name.toUpperCase());
  twin?.setBuild(byId[id]);
}
twinButtons.forEach((b) => b.addEventListener('click', () => { selectBuild(b.dataset.twinBuild, { fromTwin: true }); syncTwin(b.dataset.twinBuild); }));
sensorButtons.forEach((b) => b.addEventListener('click', () => {
  sensors[b.dataset.sensor] = !sensors[b.dataset.sensor];
  b.setAttribute('aria-pressed', String(sensors[b.dataset.sensor]));
  twin?.setSensors(sensors);
}));

new IntersectionObserver((entries, io) => {
  if (!entries.some((e) => e.isIntersecting)) return;
  io.disconnect();
  import('../three/products/xplorer-twin.js').then(({ mountXplorerTwin }) => {
    twin = mountXplorerTwin(twinHost, { build: byId[current], reducedMotion });
    // Sensor view switches itself on the first time the twin is in full view, to show what it is for.
    ScrollTrigger.create({
      trigger: twinHost, start: 'top 60%', once: true,
      onEnter: () => {
        if (sensors.lidar || sensors.camera) return twin.setSensors(sensors);
        sensors.lidar = sensors.camera = true;
        sensorButtons.forEach((b) => b.setAttribute('aria-pressed', 'true'));
        twin.setSensors(sensors);
      },
    });
  });
}, { rootMargin: '60% 0px' }).observe(twinHost);
