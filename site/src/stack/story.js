// Scroll choreography for the sticky 3D stack: it assembles on arrival to the right of the hero copy,
// then explodes and settles while the layer articles scroll past in the left column.
// Each article that crosses the middle of the viewport becomes the active layer (3D highlight + rail).

import { gsap, ScrollTrigger, reducedMotion } from '../lib/motion.js';

const HERO_VIEW = { x: 0.42, y: -0.06, scale: 0.72 };
const STORY_VIEW = { x: 0.44, y: 0.02, scale: 0.6 };
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

  // Demos mount lazily and change article heights; keep trigger positions honest.
  if (layersSection && 'ResizeObserver' in window) {
    let raf = 0;
    new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => ScrollTrigger.refresh()); }).observe(layersSection);
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

      // Hero → story: the stack explodes while the hero scrolls away, then settles into its story framing.
      const explode = ScrollTrigger.create({
        trigger: hero, start: 'top top', end: 'bottom top', scrub: true,
        onUpdate: (self) => {
          if (intro.isActive() && self.progress < 0.02) return;
          intro.progress(1);
          stack.setProgress(0.5 + 0.5 * self.progress);
        },
      });
      const slide = desktop && ScrollTrigger.create({
        trigger: hero, start: 'center top', end: 'bottom top', scrub: true,
        onUpdate: (self) => {
          const t = gsap.parseEase('power2.inOut')(self.progress);
          stack.setView({
            x: start.x + (STORY_VIEW.x - start.x) * t,
            y: start.y + (STORY_VIEW.y - start.y) * t,
            scale: start.scale + (STORY_VIEW.scale - start.scale) * t,
            labels: t > 0.5 ? 'compact' : 'full',
            side: t > 0.5 ? 'left' : 'right',
          });
        },
      });
      return () => { intro.kill(); explode.kill(); slide && slide.kill(); };
    });
  });
}
