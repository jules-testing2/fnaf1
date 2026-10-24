// L0 "one stack, every body": robot cut-outs take turns on the shared L0 plinth while the
// layers above them (L1-L5) stay put. Pauses offscreen; static first frame under reduced motion.

import { gsap, ScrollTrigger, reducedMotion } from '../lib/motion.js';

export function initBodies() {
  const slot = document.querySelector('.sas-bodies__slot');
  if (!slot) return;
  const figs = [...slot.querySelectorAll('figure')];
  if (reducedMotion || figs.length < 2) return;

  let i = 0;
  const swap = () => {
    const out = figs[i];
    i = (i + 1) % figs.length;
    const inn = figs[i];
    gsap.timeline()
      .to(out, { xPercent: -40, autoAlpha: 0, duration: 0.6, ease: 'power3.in', onComplete: () => out.classList.remove('is-on') })
      .fromTo(inn, { xPercent: 40, yPercent: -12, autoAlpha: 0 }, { xPercent: 0, yPercent: 0, autoAlpha: 1, duration: 0.9, ease: 'back.out(1.6)', onStart: () => inn.classList.add('is-on') }, '-=0.15')
      .fromTo('.sas-bodies__stack i', { y: -6 }, { y: 0, duration: 0.5, stagger: 0.04, ease: 'power2.out' }, '-=0.6');
  };
  gsap.set(figs.slice(1), { autoAlpha: 0 });

  let timer = 0;
  ScrollTrigger.create({
    trigger: slot, start: 'top bottom', end: 'bottom top',
    onToggle: (self) => { clearInterval(timer); if (self.isActive) timer = setInterval(swap, 2400); },
  });
}
