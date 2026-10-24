// Novum chapter: butterfly sprites drifting along looping motion paths behind the student grid.
// Each butterfly flies a closed, randomly generated curve through the chapter and flaps (scaleX pulse).
// Flight pauses while the chapter is offscreen; under reduced motion the butterflies rest in place.

import { gsap, ScrollTrigger, reducedMotion, isTouch } from '../lib/motion.js';

const REST = [[0.08, 0.06], [0.86, 0.1], [0.94, 0.42], [0.04, 0.55], [0.9, 0.8], [0.12, 0.92]];

export function initButterflies(section) {
  const flight = section?.querySelector('.flight');
  if (!flight) return;
  const sprites = [...flight.querySelectorAll('img')].slice(0, isTouch ? 4 : 6);
  flight.querySelectorAll('img').forEach((img, i) => { if (i >= sprites.length) img.remove(); });

  if (reducedMotion) {
    sprites.forEach((img, i) => gsap.set(img, { xPercent: -50, yPercent: -50, left: `${REST[i][0] * 100}%`, top: `${REST[i][1] * 100}%` }));
    return;
  }

  let tweens = [];
  let active = false;

  function build() {
    tweens.forEach((t) => t.kill());
    tweens = [];
    const W = flight.clientWidth, H = flight.clientHeight;
    sprites.forEach((img) => {
      // A loop of 5 waypoints that wanders over most of the chapter; first point repeated to close it.
      const pts = Array.from({ length: 5 }, () => ({ x: gsap.utils.random(0.02, 0.92) * W, y: gsap.utils.random(0.02, 0.95) * H }));
      pts.push(pts[0]);
      gsap.set(img, { x: pts[0].x, y: pts[0].y });
      const path = gsap.to(img, {
        motionPath: { path: pts, curviness: 1.6 },
        duration: gsap.utils.random(26, 40), ease: 'none', repeat: -1,
      });
      path.progress(Math.random());
      const flap = gsap.to(img, { scaleX: 0.28, duration: gsap.utils.random(0.14, 0.24), ease: 'sine.inOut', yoyo: true, repeat: -1 });
      const wobble = gsap.to(img, { rotation: gsap.utils.random(-18, 18), duration: gsap.utils.random(1.2, 2.2), ease: 'sine.inOut', yoyo: true, repeat: -1 });
      tweens.push(path, flap, wobble);
    });
    tweens.forEach((t) => t.paused(!active));
  }

  build();
  ScrollTrigger.create({
    trigger: section, start: 'top bottom', end: 'bottom top',
    onToggle: (s) => { active = s.isActive; tweens.forEach((t) => t.paused(!active)); },
  });
  let rt;
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastW) return; // ignore mobile address-bar height changes
    lastW = window.innerWidth;
    clearTimeout(rt);
    rt = setTimeout(build, 250);
  });
}
