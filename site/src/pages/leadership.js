// Leadership: the lab as three strata. Magnum (stone, heavy), Lumen (flame, warm light), Novum (butterflies, airy).
// Shared atmosphere (background colour + particles) lives in src/lab/atmosphere.js, the Novum flight in
// src/lab/butterflies.js. This file choreographs the hero, the strata stack and each chapter's entrance.

import { initSite, gsap, ScrollTrigger, SplitText, reducedMotion, isTouch } from '../lib/site.js';
import { CustomEase } from 'gsap/CustomEase';
import '../styles/pages/lab.css';
import { initAtmosphere } from '../lab/atmosphere.js';
import { initButterflies } from '../lab/butterflies.js';

initSite();
initAtmosphere();
initButterflies(document.querySelector('.chapter--novum'));

// A heavy landing: fast drop, a small overshoot, settle. Used for everything in Magnum.
CustomEase.create('thud', 'M0,0 C0.42,0 0.58,1.06 0.68,1.02 0.76,0.99 0.86,1 1,1');

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// Per-word colour ramps applied char by char after splitting, so the gradient survives the split.
const RAMPS = {
  'w--magnum': ['#a39a8b', '#e4dccd'],
  'w--lumen': ['#c1121f', '#ffb547'],
  'w--novum': ['#6fa59a', '#d9b25a'],
};

function splitChars(el, ramp, aria = 'auto') {
  const split = SplitText.create(el, { type: 'chars', charsClass: 'ch', aria });
  if (ramp) {
    const lerp = gsap.utils.interpolate(ramp[0], ramp[1]);
    split.chars.forEach((c, i, all) => (c.style.color = lerp(all.length > 1 ? i / (all.length - 1) : 0)));
  }
  return split.chars;
}

/* ---------------- Hero ---------------- */
function hero() {
  const words = $$('.lab-hero__title .w');
  // The h1 carries the aria-label; the visual words are aria-hidden.
  const charsOf = words.map((w) => splitChars(w, RAMPS[[...w.classList].find((c) => RAMPS[c])], 'none'));
  gsap.set(charsOf[1], { opacity: 0 });
  const tl = gsap.timeline({ delay: 0.35 });
  // Each word enters in its own character: stone drops, flame flickers on, butterflies flutter in.
  tl.from(charsOf[0], { yPercent: -90, opacity: 0, duration: 1.3, ease: 'thud', stagger: 0.06 })
    .to(charsOf[1], { duration: 0.9, keyframes: { opacity: [0, 0.9, 0.2, 1] }, stagger: { each: 0.06, from: 'random' } }, '-=0.6')
    .from(charsOf[2], { y: 50, rotation: () => gsap.utils.random(-40, 40), opacity: 0, duration: 1.1, ease: 'back.out(2.2)', stagger: { each: 0.05, from: 'random' } }, '-=0.5')
    .from('.lab-hero__eyebrow, .lab-hero__lead', { opacity: 0, y: 24, duration: 1, stagger: 0.1 }, 0.2)
    .from('.emblem', { opacity: 0, y: 80, scale: 0.92, duration: 1.4, stagger: 0.14 }, 0.6)
    .from('.lab-hero__cue', { opacity: 0, duration: 1 }, 1.4);

  // Idle float, slightly different per emblem.
  $$('.emblem__float').forEach((el, i) => {
    gsap.to(el, { y: -10 - i * 4, rotation: i % 2 ? 1.6 : -1.6, duration: 3.4 + i * 0.7, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  });

  // Depth: pointer parallax (desktop) plus scroll parallax, both scaled by data-depth.
  const emblems = $$('.emblem');
  if (!isTouch) {
    const movers = emblems.map((el) => ({ d: Number(el.dataset.depth) || 1, x: gsap.quickTo(el, 'x', { duration: 1.2 }), y: gsap.quickTo(el, 'y', { duration: 1.2 }) }));
    $('.lab-hero').addEventListener('pointermove', (e) => {
      const nx = e.clientX / window.innerWidth - 0.5, ny = e.clientY / window.innerHeight - 0.5;
      movers.forEach((m) => { m.x(nx * 36 * m.d); m.y(ny * 24 * m.d); });
    });
  }
  emblems.forEach((el) => {
    gsap.to(el.querySelector('.emblem__link'), {
      yPercent: -40 * (Number(el.dataset.depth) || 1), ease: 'none',
      scrollTrigger: { trigger: '.lab-hero', start: 'top top', end: 'bottom top', scrub: true },
    });
  });
  gsap.to('.lab-hero__title', { yPercent: 30, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: '.lab-hero', start: 'top top', end: 'bottom top', scrub: true } });
}

/* ---------------- Strata: bedrock first, then the layers settle on top ---------------- */
function strata() {
  const section = $('.strata');
  section.classList.add('is-scrub');
  const [novum, lumen, magnum] = $$('.band', section);
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: section, start: 'top top', end: 'bottom bottom', scrub: 0.8 },
  });
  tl.from('.strata__head', { opacity: 0, y: 40, duration: 0.5 })
    .from(magnum, { yPercent: 160, opacity: 0, duration: 1, ease: 'power3.in' }, 0.2) // heavy: accelerates into place
    .from(magnum.querySelector('.band__img'), { opacity: 0, scale: 0.7, duration: 0.4 }, 1)
    .from(lumen, { xPercent: -30, opacity: 0, duration: 1, ease: 'power2.out' }, 1.2)
    .to(magnum, { y: 6, duration: 0.3 }, 1.9) // the bedrock takes the weight
    .from(lumen.querySelector('.band__img'), { opacity: 0, scale: 0.7, rotation: -30, duration: 0.4 }, 2)
    .from(novum, { yPercent: -120, opacity: 0, rotation: -1.5, duration: 1, ease: 'power2.out' }, 2.2)
    .from(novum.querySelector('.band__img'), { opacity: 0, y: -30, duration: 0.4 }, 3)
    .to({}, { duration: 0.6 }); // hold the finished stack before releasing the pin
}

/* ---------------- Chapters ---------------- */
// Splits a chapter's big Latin word and gives it the chapter's own entrance. Pass `from` vars for a
// from-tween, or `to` vars (with keyframes) for an entrance that starts fully transparent.
function chapterWord(chapter, { from, to }) {
  const chars = splitChars($('.chapter__word', chapter));
  const scrollTrigger = { trigger: $('.chapter__word', chapter), start: 'top 85%' };
  if (from) gsap.from(chars, { ...from, scrollTrigger });
  else { gsap.set(chars, { opacity: 0 }); gsap.to(chars, { ...to, scrollTrigger }); }
}

function chapterHead(chapter) {
  const items = $$('.chapter__kicker, .chapter__tagline, .chapter__values span, .chapter__desc', chapter);
  gsap.from(items, { opacity: 0, y: 26, duration: 1.1, stagger: 0.08, scrollTrigger: { trigger: $('.chapter__text', chapter), start: 'top 75%' } });
  gsap.fromTo($('.chapter__ghost', chapter), { xPercent: 8 }, { xPercent: -28, ease: 'none', scrollTrigger: { trigger: chapter, start: 'top bottom', end: 'bottom top', scrub: true } });
}

function magnum() {
  const ch = $('.chapter--magnum');
  chapterHead(ch);
  chapterWord(ch, { from: { yPercent: -110, opacity: 0, duration: 1.6, ease: 'thud', stagger: 0.09 } });
  gsap.from($('.chapter__emblem img', ch), { y: -120, opacity: 0, duration: 2, ease: 'thud', scrollTrigger: { trigger: $('.chapter__emblem', ch), start: 'top 80%' } });
  gsap.from($$('.person', ch), { y: -70, opacity: 0, duration: 1.7, ease: 'thud', stagger: 0.3, scrollTrigger: { trigger: $('.people', ch), start: 'top 80%' } });
}

function lumen() {
  const ch = $('.chapter--lumen');
  chapterHead(ch);
  chapterWord(ch, { to: { duration: 1.2, keyframes: { opacity: [0, 1, 0.25, 0.9, 0.4, 1] }, stagger: { each: 0.08, from: 'random' } } });
  gsap.from($$('.person', ch), { y: 50, opacity: 0, duration: 1.3, stagger: 0.15, scrollTrigger: { trigger: $('.people', ch), start: 'top 80%' } });

  // A warm light that follows the pointer (or drifts by itself on touch) and flickers like a flame.
  const glow = $('.lumen-glow', ch);
  const cards = $$('.person', ch);
  const gx = gsap.quickTo(glow, 'x', { duration: 0.9 }), gy = gsap.quickTo(glow, 'y', { duration: 0.9 });
  const light = (x, y) => {
    gx(x); gy(y);
    const r0 = ch.getBoundingClientRect();
    cards.forEach((c) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--lx', `${x - (r.left - r0.left)}px`);
      c.style.setProperty('--ly', `${y - (r.top - r0.top)}px`);
    });
  };
  const flicker = gsap.to(glow, { opacity: () => gsap.utils.random(0.7, 1), duration: () => gsap.utils.random(0.06, 0.22), ease: 'none', repeat: -1, repeatRefresh: true, paused: true });
  let drift;
  if (isTouch) {
    const pos = { t: 0 };
    drift = gsap.to(pos, { t: Math.PI * 2, duration: 14, ease: 'none', repeat: -1, paused: true, onUpdate: () => light(ch.clientWidth * (0.5 + 0.35 * Math.sin(pos.t)), ch.clientHeight * (0.55 + 0.25 * Math.sin(pos.t * 2))) });
  } else {
    ch.addEventListener('pointermove', (e) => { const r = ch.getBoundingClientRect(); light(e.clientX - r.left, e.clientY - r.top); });
  }
  light(ch.clientWidth * 0.7, ch.clientHeight * 0.3);
  ScrollTrigger.create({ trigger: ch, start: 'top bottom', end: 'bottom top', onToggle: (s) => { flicker.paused(!s.isActive); drift?.paused(!s.isActive); } });
}

function novum() {
  const ch = $('.chapter--novum');
  chapterHead(ch);
  chapterWord(ch, { from: { y: 70, rotation: () => gsap.utils.random(-50, 50), opacity: 0, duration: 1.2, ease: 'back.out(2.4)', stagger: { each: 0.06, from: 'random' } } });
  // Playful staggered grid: cards pop in from scattered angles, in a random order.
  gsap.from($$('.person', ch), {
    y: 90, scale: 0.86, rotation: () => gsap.utils.random(-12, 12), opacity: 0, duration: 1.1, ease: 'back.out(1.7)',
    stagger: { each: 0.09, from: 'random' }, scrollTrigger: { trigger: $('.people', ch), start: 'top 82%' },
  });
}

/* ---------------- Interludes: words light up as they are read ---------------- */
function interludes() {
  $$('.interlude__line').forEach((line) => {
    const split = SplitText.create(line, { type: 'words', aria: 'none' });
    gsap.fromTo(split.words, { opacity: 0.08, y: 14 }, { opacity: 1, y: 0, ease: 'none', stagger: 0.12, scrollTrigger: { trigger: line, start: 'top 85%', end: 'bottom 45%', scrub: true } });
  });
}

// Split text needs final font metrics, so the choreography starts once fonts are ready.
// Until then the hero stays hidden (see .lab-ready in lab.css) to avoid a flash of unsplit text.
const ready = () => document.documentElement.classList.add('lab-ready');
if (reducedMotion) ready();
else {
  document.fonts.ready.then(() => {
    ready(); // from-tweens below render their start state immediately, so there is no flash
    hero();
    strata();
    magnum();
    lumen();
    novum();
    interludes();
    ScrollTrigger.refresh();
  });
}
