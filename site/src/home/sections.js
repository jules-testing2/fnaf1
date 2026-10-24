// Scroll moments below the hero: manifesto word scrub, the platforms gallery, the SAS layer stack
// and the expanding use-case cards. Each init is independent and safe when its section is missing.

import { gsap, ScrollTrigger, SplitText, reducedMotion } from '../lib/motion.js';

/** Manifesto: words brighten from ghost to ink as the paragraph scrolls through the viewport. */
export function initManifesto() {
  const el = document.querySelector('[data-scrub-words]');
  if (!el || reducedMotion) return;
  document.fonts.ready.then(() => {
    const split = SplitText.create(el, { type: 'words', wordsClass: 'w' });
    gsap.to(split.words, {
      opacity: 1, ease: 'none', stagger: 0.12,
      scrollTrigger: { trigger: el, start: 'top 78%', end: 'bottom 52%', scrub: 0.4 },
    });
  });
}

/**
 * Platforms: on wide screens with motion, the section pins and the track drives sideways with scroll;
 * each robot drifts against the track for depth. Elsewhere it stays a native swipe carousel.
 */
export function initPlatforms() {
  const section = document.querySelector('[data-plats]');
  if (!section) return;
  const viewport = section.querySelector('.plats__viewport');
  const track = section.querySelector('[data-plats-track]');
  const panels = [...track.children];
  const countEl = section.querySelector('[data-plats-count]');
  const bar = section.querySelector('[data-plats-bar]');
  const report = (p) => {
    const i = Math.min(panels.length - 1, Math.round(p * (panels.length - 1)));
    countEl.textContent = String(i + 1).padStart(2, '0');
    bar.style.transform = `scaleX(${(i + 1) / panels.length})`;
  };

  const mm = gsap.matchMedia();
  mm.add('(min-width: 861px) and (prefers-reduced-motion: no-preference)', () => {
    section.classList.add('is-pinned');
    section.querySelectorAll('img[loading="lazy"]').forEach((img) => (img.loading = 'eager'));
    const distance = () => Math.max(0, track.scrollWidth - viewport.clientWidth);
    const slide = gsap.to(track, {
      x: () => -distance(), ease: 'none',
      scrollTrigger: {
        trigger: section, start: 'top top', end: () => `+=${distance()}`, pin: true, scrub: 0.8,
        invalidateOnRefresh: true, onUpdate: (self) => report(self.progress),
      },
    });
    panels.forEach((panel) => {
      const img = panel.querySelector('.plat__img');
      const text = panel.querySelector('.plat__text');
      const trig = { trigger: panel, containerAnimation: slide, start: 'left right', end: 'right left', scrub: true };
      gsap.fromTo(img, { xPercent: 16, rotate: 2 }, { xPercent: -16, rotate: -2, ease: 'none', scrollTrigger: trig });
      gsap.fromTo(text, { x: 60, opacity: 0.25 }, { x: 0, opacity: 1, ease: 'none', scrollTrigger: { ...trig, end: 'left 35%' } });
    });
    ScrollTrigger.refresh();
    return () => section.classList.remove('is-pinned');
  });

  // Carousel mode progress.
  viewport.addEventListener('scroll', () => {
    if (section.classList.contains('is-pinned')) return;
    const max = viewport.scrollWidth - viewport.clientWidth;
    report(max > 0 ? viewport.scrollLeft / max : 0);
  }, { passive: true });
}

/**
 * Stack: six plates spread apart as the section scrolls in, and the lit layer climbs L0 to L5.
 * Hovering or focusing a layer in the list takes over the highlight.
 */
export function initStack() {
  const section = document.querySelector('[data-stack]');
  if (!section) return;
  const scene = section.querySelector('.sas__scene');
  const plates = [...section.querySelectorAll('[data-plate]')];
  const list = section.querySelector('[data-stack-list]');
  const buttons = [...list.querySelectorAll('button[data-layer]')];
  let manual = false;
  let current = -1;

  const setActive = (i) => {
    if (i === current) return;
    current = i;
    plates.forEach((p) => p.classList.toggle('is-active', Number(p.dataset.plate) === i));
    buttons.forEach((b) => {
      const on = Number(b.dataset.layer) === i;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  };

  buttons.forEach((b) => {
    const take = () => { manual = true; setActive(Number(b.dataset.layer)); };
    b.addEventListener('pointerenter', take);
    b.addEventListener('focus', take);
    b.addEventListener('click', take);
  });
  list.addEventListener('pointerleave', () => { manual = false; });
  list.addEventListener('focusout', (e) => { if (!list.contains(e.relatedTarget)) manual = false; });

  if (reducedMotion) { scene.style.setProperty('--gap', '40px'); setActive(3); return; }

  setActive(0);
  gsap.fromTo(scene, { '--gap': '10px', '--rz': '-62deg' }, {
    '--gap': '46px', '--rz': '-36deg', ease: 'none',
    scrollTrigger: {
      trigger: section.querySelector('[data-sas]'), start: 'top 85%', end: 'bottom 25%', scrub: 0.6,
      onUpdate: (self) => { if (!manual) setActive(Math.min(5, Math.floor(self.progress * 6.4))); },
    },
  });
}

/** Use cases: the hovered, focused or tapped card expands; the others narrow. */
export function initUseCases() {
  const list = document.querySelector('[data-uses]');
  if (!list) return;
  const cards = [...list.children];
  const activate = (card) => cards.forEach((c) => {
    c.classList.toggle('is-active', c === card);
    c.setAttribute('aria-expanded', String(c === card));
  });
  cards.forEach((card) => {
    card.setAttribute('role', 'button');
    card.addEventListener('pointerenter', () => activate(card));
    card.addEventListener('focus', () => activate(card));
    card.addEventListener('click', () => activate(card));
  });
  activate(cards[0]);
}
