// Hero: entry choreography, the scroll-scrubbed hand-off from perspective view to top-down semantic map,
// and lazy boot of the WebGL scene after first paint. Without WebGL the SVG poster stays as the visual.

import { gsap, ScrollTrigger, SplitText, reducedMotion } from '../lib/motion.js';

const fmt = (n) => n.toLocaleString('en-US');

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

/** Updates the HUD readouts from scene telemetry, touching the DOM only when a value changes. */
function hudWriter(hero) {
  const fields = Object.fromEntries([...hero.querySelectorAll('[data-hud]')].map((el) => [el.dataset.hud, el]));
  const last = {};
  const set = (k, v) => { if (fields[k] && last[k] !== v) { last[k] = v; fields[k].textContent = v; } };
  return (s) => {
    set('points', fmt(s.points));
    set('objects', `${s.objects} / ${s.total}`);
    set('heading', `${String(s.heading).padStart(3, '0')}°`);
    set('pose', `${s.x.toFixed(1)}, ${s.z.toFixed(1)}`);
  };
}

/** Title, eyebrow and CTAs arrive once the intro (if any) has lifted. */
function entry(hero, introDone) {
  const root = document.documentElement;
  const title = hero.querySelector('.hero__title');
  const eyebrow = hero.querySelector('.hero__eyebrow');
  const rest = hero.querySelectorAll('.hero__lead, .hero__ctas, .hero__proof');
  const hud = hero.querySelector('.hero__hud');
  if (reducedMotion) { root.classList.remove('hero-pending'); return; }

  Promise.all([document.fonts.ready, introDone]).then(() => {
    const split = SplitText.create(title, { type: 'lines', mask: 'lines', linesClass: 'hero-split' });
    gsap.set(split.lines, { yPercent: 110 });
    gsap.set(rest, { opacity: 0, y: 26 });
    gsap.set(hud, { opacity: 0 });
    root.classList.remove('hero-pending');
    const text = eyebrow.textContent;
    gsap.timeline({ delay: 0.05 })
      .to(eyebrow, { duration: 1, scrambleText: { text, chars: '01<>/_#:SAIM', speed: 0.6 }, ease: 'none' }, 0)
      .to(split.lines, { yPercent: 0, duration: 1.3, stagger: 0.12, ease: 'expo.out' }, 0.05)
      .to(rest, { opacity: 1, y: 0, duration: 1.1, stagger: 0.09 }, 0.45)
      .to(hud, { opacity: 1, duration: 1.2, ease: 'power1.out' }, 0.6);
  });
}

/** Pins the hero and scrubs the hand-off to the top-down map. Returns a setter for the scene. */
function scrollHandOff(hero, getScene) {
  const content = hero.querySelector('.hero__content');
  const note = hero.querySelector('.hero__mapnote');
  const cue = hero.querySelector('.hero__cue');
  const shade = hero.querySelector('.hero__shade');
  const mode = hero.querySelector('[data-hud-mode]');
  let topDown = false;

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: hero, start: 'top top', end: '+=110%', pin: true, scrub: 0.6,
      onUpdate: (self) => {
        const p = gsap.utils.clamp(0, 1, (self.progress - 0.12) / 0.7);
        getScene()?.setProgress(p);
        if ((p > 0.55) !== topDown) {
          topDown = p > 0.55;
          mode.textContent = topDown ? 'Semantic map · top-down' : 'Perception · LiDAR sweep';
        }
      },
    },
  });
  tl.fromTo(content, { yPercent: 0, opacity: 1, filter: 'blur(0px)' }, { yPercent: -18, opacity: 0, filter: 'blur(8px)', duration: 0.42 }, 0)
    .to(cue, { opacity: 0, duration: 0.1 }, 0)
    .to(shade, { opacity: 0.35, duration: 0.5 }, 0.1)
    .fromTo(note, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.25 }, 0.62)
    .to({}, { duration: 0.13 }); // hold the finished map before unpinning
}

/** Loads three.js and the scene once the browser is idle, so the page is usable before WebGL boots. */
function bootScene(hero, introDone, onReady) {
  const stageEl = hero.querySelector('[data-hero-stage]');
  if (!webglAvailable()) return;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 250));
  introDone.then(() => idle(async () => {
    try {
      const { mountHeroScene } = await import('../three/hero.js');
      const scene = mountHeroScene(stageEl, {
        labels: hero.querySelector('[data-hero-labels]'),
        reducedMotion,
        onStats: hudWriter(hero),
      });
      onReady(scene);
      requestAnimationFrame(() => requestAnimationFrame(() => stageEl.classList.add('is-live')));
    } catch (err) {
      console.error('[hero] WebGL scene failed, keeping the static poster', err);
    }
  }, { timeout: 1500 }));
}

export function initHero(introDone) {
  const hero = document.querySelector('[data-hero]');
  if (!hero) return;
  let scene = null;
  let progress = 0;
  entry(hero, introDone);
  if (!reducedMotion) scrollHandOff(hero, () => scene);
  bootScene(hero, introDone, (s) => {
    scene = s;
    // Catch up if the visitor scrolled before the scene arrived.
    const st = ScrollTrigger.getAll().find((t) => t.trigger === hero);
    if (st) progress = gsap.utils.clamp(0, 1, (st.progress - 0.12) / 0.7);
    scene.setProgress(progress);
  });
}
