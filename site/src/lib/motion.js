// Motion engine: Lenis smooth scroll driven by the GSAP ticker, plus declarative scroll animations.
//
// Attributes any page can use without writing JS:
//   data-reveal              fade + rise on enter. Values: "" | "up" | "left" | "right" | "scale" | "blur" | "clip"
//   data-reveal-delay="0.2"  extra delay in seconds
//   data-stagger             on a parent: reveal its direct children one after another (children need no attribute)
//   data-split="lines|words|chars"   SplitText reveal on enter (default "lines")
//   data-scramble            scramble-decode the text on enter (good on mono labels)
//   data-counter="97"        count up on enter. Optional: data-decimals="2" data-prefix="" data-suffix="%"
//   data-parallax="0.25"     move along y while scrolling past (fraction of element height; negative = opposite)
//   data-magnetic            pointer-follow on hover (buttons, small elements)
//   data-tilt                3D tilt on hover (cards)
//   data-spotlight           exposes --mx/--my on hover for the radial spotlight in components.css
//   data-marquee="40"        infinite horizontal marquee, speed in px/s; children are duplicated automatically
//   data-draw                animate stroke drawing of every path/line/circle inside an <svg> on enter
//   data-pin-progress        sets --p (0..1) on the element while it crosses the viewport, for CSS-driven effects

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { CustomEase } from 'gsap/CustomEase';
import { Flip } from 'gsap/Flip';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin, DrawSVGPlugin, MotionPathPlugin, CustomEase, Flip);
CustomEase.create('saim', '0.16, 1, 0.3, 1');
gsap.defaults({ ease: 'saim', duration: 1 });

export { gsap, ScrollTrigger, SplitText, Flip };
export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;

export let lenis = null;

export function initSmoothScroll() {
  if (reducedMotion) return null;
  lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 1, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  // In-page anchors scroll smoothly and respect the fixed nav.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href').length < 2) return;
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    lenis.scrollTo(target, { offset: -80, duration: 1.4 });
  });
  return lenis;
}

const REVEAL_FROM = {
  '': { y: 60 },
  up: { y: 60 },
  left: { x: -80 },
  right: { x: 80 },
  scale: { scale: 0.88 },
  blur: { y: 30, filter: 'blur(14px)' },
  clip: { clipPath: 'inset(0 0 100% 0)' },
};

function reveal(root) {
  root.querySelectorAll('[data-stagger]').forEach((parent) => {
    const kids = [...parent.children];
    gsap.set(kids, { opacity: 0, y: 40 });
    ScrollTrigger.create({
      trigger: parent, start: 'top 85%', once: true,
      onEnter: () => gsap.to(kids, { opacity: 1, y: 0, duration: 1.1, stagger: Number(parent.dataset.stagger) || 0.09 }),
    });
  });

  root.querySelectorAll('[data-reveal]').forEach((el) => {
    const from = REVEAL_FROM[el.dataset.reveal] || REVEAL_FROM[''];
    const delay = Number(el.dataset.revealDelay) || 0;
    ScrollTrigger.create({
      trigger: el, start: 'top 88%', once: true,
      onEnter: () => {
        el.classList.add('is-in');
        gsap.fromTo(el, { opacity: 0, ...from }, { opacity: 1, x: 0, y: 0, scale: 1, filter: 'blur(0px)', clipPath: 'inset(0 0 0% 0)', duration: 1.2, delay, clearProps: 'filter,clipPath' });
      },
    });
  });
}

function splits(root) {
  root.querySelectorAll('[data-split]').forEach((el) => {
    const type = el.dataset.split || 'lines';
    // Keep the element visible; SplitText hides only the pieces it animates.
    document.fonts.ready.then(() => {
      const split = SplitText.create(el, { type: type === 'lines' ? 'lines' : `lines,${type}`, mask: 'lines', linesClass: 'split-line' });
      const targets = split[type];
      gsap.set(targets, { yPercent: type === 'chars' ? 110 : 105, opacity: type === 'chars' ? 0 : 1 });
      ScrollTrigger.create({
        trigger: el, start: 'top 88%', once: true,
        onEnter: () => gsap.to(targets, { yPercent: 0, opacity: 1, duration: type === 'chars' ? 0.9 : 1.25, stagger: type === 'chars' ? 0.018 : type === 'words' ? 0.035 : 0.1 }),
      });
    });
  });
}

function scrambles(root) {
  root.querySelectorAll('[data-scramble]').forEach((el) => {
    const text = el.textContent;
    ScrollTrigger.create({
      trigger: el, start: 'top 92%', once: true,
      onEnter: () => gsap.to(el, { duration: 1.1, scrambleText: { text, chars: '01<>/_#:SAIM', speed: 0.6 }, ease: 'none' }),
    });
  });
}

function counters(root) {
  root.querySelectorAll('[data-counter]').forEach((el) => {
    const end = Number(el.dataset.counter);
    const dec = Number(el.dataset.decimals) || 0;
    const pre = el.dataset.prefix || '';
    const suf = el.dataset.suffix || '';
    const fmt = (v) => pre + v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
    el.textContent = fmt(0);
    const obj = { v: 0 };
    ScrollTrigger.create({
      trigger: el, start: 'top 90%', once: true,
      onEnter: () => gsap.to(obj, { v: end, duration: 2.2, ease: 'power3.out', onUpdate: () => (el.textContent = fmt(obj.v)) }),
    });
  });
}

function parallax(root) {
  root.querySelectorAll('[data-parallax]').forEach((el) => {
    const amt = Number(el.dataset.parallax) || 0.2;
    gsap.fromTo(el, { yPercent: -amt * 50 }, { yPercent: amt * 50, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
}

function draws(root) {
  root.querySelectorAll('[data-draw]').forEach((svg) => {
    const paths = svg.querySelectorAll('path, line, polyline, circle, rect, ellipse');
    gsap.set(paths, { drawSVG: '0%' });
    ScrollTrigger.create({ trigger: svg, start: 'top 85%', once: true, onEnter: () => gsap.to(paths, { drawSVG: '100%', duration: 1.8, stagger: 0.04, ease: 'power2.inOut' }) });
  });
}

function pinProgress(root) {
  root.querySelectorAll('[data-pin-progress]').forEach((el) => {
    ScrollTrigger.create({ trigger: el, start: 'top bottom', end: 'bottom top', onUpdate: (s) => el.style.setProperty('--p', s.progress.toFixed(4)) });
  });
}

function marquees(root) {
  root.querySelectorAll('[data-marquee]').forEach((el) => {
    const speed = Number(el.dataset.marquee) || 40;
    const track = el.querySelector('.marquee__track') || el.firstElementChild;
    const clone = track.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    el.appendChild(clone);
    const tracks = [track, clone];
    let x = 0;
    let dir = 1;
    if (lenis) lenis.on('scroll', ({ direction }) => { if (direction) dir = direction; });
    gsap.ticker.add((_, dt) => {
      const w = track.offsetWidth;
      if (!w) return;
      x -= (speed * dt * dir) / 1000;
      if (x <= -w) x += w;
      if (x > 0) x -= w;
      tracks.forEach((t) => (t.style.transform = `translate3d(${x}px,0,0)`));
    });
  });
}

function pointerFx(root) {
  if (isTouch) return;
  root.querySelectorAll('[data-magnetic]').forEach((el) => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - r.left - r.width / 2) * 0.3);
      yTo((e.clientY - r.top - r.height / 2) * 0.35);
    });
    el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
  });
  root.querySelectorAll('[data-tilt]').forEach((el) => {
    const max = Number(el.dataset.tilt) || 8;
    gsap.set(el, { transformPerspective: 900 });
    const rx = gsap.quickTo(el, 'rotationX', { duration: 0.8 });
    const ry = gsap.quickTo(el, 'rotationY', { duration: 0.8 });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      ry(((e.clientX - r.left) / r.width - 0.5) * max * 2);
      rx(-((e.clientY - r.top) / r.height - 0.5) * max * 2);
    });
    el.addEventListener('pointerleave', () => { rx(0); ry(0); });
  });
  root.querySelectorAll('[data-spotlight]').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });
}

/** Wires every declarative animation inside root. Safe to call again on injected markup. */
export function initMotion(root = document) {
  if (reducedMotion) {
    root.querySelectorAll('[data-counter]').forEach((el) => {
      const dec = Number(el.dataset.decimals) || 0;
      el.textContent = (el.dataset.prefix || '') + Number(el.dataset.counter).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (el.dataset.suffix || '');
    });
    marquees(root);
    return;
  }
  reveal(root);
  splits(root);
  scrambles(root);
  counters(root);
  parallax(root);
  draws(root);
  pinProgress(root);
  marquees(root);
  pointerFx(root);
}

/** Nav hide-on-scroll-down, scrolled state and the top progress bar. */
export function initScrollChrome() {
  const nav = document.querySelector('.site-nav');
  const bar = document.querySelector('.scroll-progress');
  let last = 0;
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate: (self) => {
      const y = self.scroll();
      nav?.classList.toggle('is-scrolled', y > 40);
      nav?.classList.toggle('is-hidden', y > 400 && y > last && !document.documentElement.classList.contains('nav-open'));
      last = y;
      if (bar) bar.style.transform = `scaleX(${self.progress})`;
    },
  });
}

export function initCursor() {
  const cursor = document.querySelector('.cursor');
  if (!cursor || isTouch || reducedMotion) { cursor?.remove(); return; }
  const dot = cursor.querySelector('.cursor__dot');
  const ring = cursor.querySelector('.cursor__ring');
  const dx = gsap.quickTo(dot, 'x', { duration: 0.08 }), dy = gsap.quickTo(dot, 'y', { duration: 0.08 });
  const rx = gsap.quickTo(ring, 'x', { duration: 0.45 }), ry = gsap.quickTo(ring, 'y', { duration: 0.45 });
  window.addEventListener('pointermove', (e) => { dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY); });
  document.addEventListener('pointerover', (e) => cursor.classList.toggle('is-hover', !!e.target.closest('a, button, [data-cursor]')));
}

/** Column wipe out on load and in before navigating to another page of the site. */
export function initPageTransitions() {
  const cols = document.querySelectorAll('.page-wipe i');
  if (!cols.length || reducedMotion) return;
  gsap.set(cols, { scaleY: 1, transformOrigin: 'top' });
  gsap.to(cols, { scaleY: 0, duration: 0.9, stagger: 0.06, ease: 'power4.inOut', delay: 0.05 });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !url.pathname.endsWith('.html') || (url.pathname === location.pathname && url.hash)) return;
    e.preventDefault();
    gsap.set(cols, { transformOrigin: 'bottom' });
    gsap.to(cols, { scaleY: 1, duration: 0.6, stagger: 0.05, ease: 'power4.inOut', onComplete: () => (location.href = url.href) });
  });
  // Restoring from bfcache leaves the wipe closed; reopen it.
  window.addEventListener('pageshow', (e) => { if (e.persisted) gsap.set(cols, { scaleY: 0 }); });
}
