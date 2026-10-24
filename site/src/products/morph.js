// Small helpers that make spec values change with intent instead of snapping:
// numbers tween between values, text values scramble-decode into the new string.

import { gsap, reducedMotion } from '../lib/motion.js';

const NUM = /^([^\d-]*)(-?\d+(?:\.\d+)?)(.*)$/;
const running = new WeakMap(); // el -> active tween, so a fast re-click cancels the previous morph

/** Splits "150 kg" into { pre: '', n: 150, post: ' kg', dec: 0 }; returns null for non-numeric text. */
export function parseValue(text) {
  const m = NUM.exec(text);
  if (!m) return null;
  const dec = (m[2].split('.')[1] || '').length;
  return { pre: m[1], n: Number(m[2]), post: m[3], dec };
}

/**
 * Animates el's text to `to`. When both the current and the next value are numbers with the
 * same unit the number tweens, otherwise the text scrambles into place.
 */
export function morphValue(el, to, { duration = 1.1 } = {}) {
  running.get(el)?.kill();
  const from = el.textContent.trim();
  if (from === to) return;
  if (reducedMotion) { el.textContent = to; return; }
  const a = parseValue(from);
  const b = parseValue(to);
  let tween;
  if (a && b && a.post === b.post && a.pre === b.pre) {
    const o = { v: a.n };
    const fmt = (v) => b.pre + v.toLocaleString('en-US', { minimumFractionDigits: b.dec, maximumFractionDigits: b.dec }) + b.post;
    tween = gsap.to(o, { v: b.n, duration, ease: 'power3.out', onUpdate: () => (el.textContent = fmt(o.v)), onComplete: () => (el.textContent = to) });
  } else {
    tween = gsap.to(el, { duration: duration * 0.8, scrambleText: { text: to, chars: '01<>/_#:', speed: 0.7 }, ease: 'none' });
  }
  running.set(el, tween);
}
