// Scroll choreography for the sticky 3D stack: it assembles on arrival, sits to the right of the hero,
// then slides into the left column and explodes while the layer articles scroll past on the right.
// Each article that crosses the middle of the viewport becomes the active layer (3D highlight + rail).

import { gsap, ScrollTrigger, reducedMotion } from '../lib/motion.js';

const HERO_VIEW = { x: 0.5, y: -0.06, scale: 0.78 };
const STORY_VIEW = { x: -0.56, y: 0, scale: 0.86 };
const MOBILE_VIEW = { x: 0, y: 0.04, scale: 1.05 };

function whenReady(el) {
  return new Promise((resolve) => {
    if (el.sasStack) return resolve(el.sasStack);
    el.addEventListener('demo:ready', (e) => resolve(e.detail), { once: true });
  });
}

export function initStory() {
  const host = document.querySelector('.sas-stage__canvas');
  const hero = document.querySelector('.sas-hero');
  const layersSection = document.querySelector('.sas-layers');
  const articles = [...document.querySelectorAll('.sas-layer')];
  const rail = document.querySelector('.sas-rail');
  const railLinks = rail ? [...rail.querySelectorAll('a')] : [];
  if (!host || !hero) return;

  let active = -1;
  let stack = null;
  const setActive = (i) => {
    if (i === active) return;
    active = i;
    stack?.setLayer(i);
    railLinks.forEach((a) => a.classList.toggle('is-active', Number(a.dataset.i) === i));
    articles.forEach((a, k) => a.classList.toggle('is-active', k === i));
  };

  // Active layer follows the article crossing the viewport centre (works on every breakpoint).
  articles.forEach((article, i) => {
    ScrollTrigger.create({
      trigger: article, start: 'top 55%', end: 'bottom 55%',
      onToggle: (self) => { if (self.isActive) setActive(i); else if (i === 0 && self.direction < 0) setActive(-1); },
    });
  });

  // The rail only appears while the layer story is on screen.
  if (rail && layersSection) {
    ScrollTrigger.create({
      trigger: layersSection, start: 'top 60%', end: 'bottom 40%',
      onToggle: (self) => rail.classList.toggle('is-visible', self.isActive),
    });
  }

  whenReady(host).then((api) => {
    stack = api;
    stack.setLayer(active);
    const mm = gsap.matchMedia();
    mm.add({ desktop: '(min-width: 961px)', mobile: '(max-width: 960px)' }, (ctx) => {
      const { desktop } = ctx.conditions;
      const start = desktop ? HERO_VIEW : MOBILE_VIEW;
      stack.setView(start);

      if (reducedMotion) { stack.setProgress(desktop ? 0.5 : 0.75); return; }

      // Entry: scattered slabs fly together into an assembled stack.
      const entry = { p: 0 };
      const intro = gsap.to(entry, { p: 0.5, duration: 2.2, delay: 0.35, ease: 'power3.out', onUpdate: () => stack.setProgress(entry.p) });

      // Hero → story: explode the stack and move it to the left column (desktop) as the hero scrolls away.
      const state = { p: 0.5, t: 0 };
      const st = ScrollTrigger.create({
        trigger: hero, start: 'top top', end: 'bottom 30%', scrub: true,
        onUpdate: (self) => {
          if (intro.isActive() && self.progress < 0.02) return;
          intro.progress(1);
          state.p = 0.5 + 0.5 * self.progress;
          stack.setProgress(state.p);
          if (desktop) {
            const t = gsap.parseEase('power2.inOut')(self.progress);
            stack.setView({
              x: start.x + (STORY_VIEW.x - start.x) * t,
              y: start.y + (STORY_VIEW.y - start.y) * t,
              scale: start.scale + (STORY_VIEW.scale - start.scale) * t,
            });
          }
        },
      });
      return () => { intro.kill(); st.kill(); };
    });
  });
}
