// First-visit boot intro: the six SAS layers check in, a counter runs to 100, then the panel lifts.
// Shown once per session (the inline script in index.html decides before first paint), under 1.5 s,
// skippable with any click, key, wheel or touch, and never shown under reduced motion.

import { gsap, lenis } from '../lib/motion.js';

const KEY = 'saim:intro';

/** @returns {Promise<boolean>} resolves when the page is uncovered; true if the intro actually played */
export function playIntro() {
  const root = document.documentElement;
  const el = document.querySelector('[data-intro]');
  if (!root.classList.contains('has-intro') || !el) {
    el?.remove();
    return Promise.resolve(false);
  }
  try { sessionStorage.setItem(KEY, '1'); } catch { /* private mode: intro may show again, harmless */ }
  lenis?.stop();

  return new Promise((resolve) => {
    const count = el.querySelector('.intro__count');
    const meter = { v: 0 };
    const tl = gsap.timeline({
      defaults: { ease: 'power2.out' },
      onComplete: () => {
        root.classList.remove('has-intro');
        el.remove();
        lenis?.start();
        removeEventListeners();
      },
    });
    tl.from(el.querySelector('.intro__logo'), { opacity: 0, y: 12, duration: 0.35 })
      .to(el.querySelectorAll('.intro__log li'), { opacity: 1, duration: 0.2, stagger: 0.1 }, 0.1)
      .to(el.querySelector('.intro__bar i'), { scaleX: 1, duration: 0.95, ease: 'power1.inOut' }, 0.1)
      .to(meter, { v: 100, duration: 0.95, ease: 'power1.inOut', onUpdate: () => (count.textContent = String(Math.round(meter.v)).padStart(3, '0')) }, 0.1)
      .add(() => resolve(true), 1.08)
      .to(el, { clipPath: 'inset(0 0 100% 0)', duration: 0.45, ease: 'power3.inOut' }, 1.05);

    const skip = () => tl.timeScale(5);
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, skip, { passive: true }));
    const removeEventListeners = () => events.forEach((e) => window.removeEventListener(e, skip));
  });
}
