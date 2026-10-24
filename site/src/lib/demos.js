// Lazy loader for interactive visualisations ("demos").
//
// Markup:   <div data-demo="route-replan" data-options='{"compact":true}'></div>
// Module:   src/demos/route-replan.js
//
//   export default function mount(el, { options, reducedMotion }) {
//     // build canvas / svg / DOM inside el
//     return { play() {}, pause() {}, destroy() {} };   // all optional
//   }
//
// Any file dropped into src/demos/ is picked up automatically. A demo is imported when it gets
// within ~1 viewport of the screen, and play/pause follow its visibility so offscreen demos cost nothing.

import { reducedMotion } from './motion.js';

const modules = import.meta.glob('../demos/*.js');

export function initDemos(root = document) {
  const nodes = [...root.querySelectorAll('[data-demo]')];
  if (!nodes.length) return;

  const instances = new Map();
  const visibility = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const inst = instances.get(e.target);
      if (!inst) continue;
      if (e.isIntersecting) inst.play?.(); else inst.pause?.();
    }
  }, { threshold: 0.01 });

  const loader = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      loader.unobserve(e.target);
      load(e.target);
    }
  }, { rootMargin: '100% 0px' });

  async function load(el) {
    const name = el.dataset.demo;
    const importer = modules[`../demos/${name}.js`];
    if (!importer) { console.warn(`[demos] unknown demo "${name}"`); return; }
    let options = {};
    try { options = el.dataset.options ? JSON.parse(el.dataset.options) : {}; } catch (err) { console.warn(`[demos] bad data-options on "${name}"`, err); }
    try {
      const mod = await importer();
      const inst = mod.default(el, { options, reducedMotion }) || {};
      instances.set(el, inst);
      el.classList.add('is-mounted');
      visibility.observe(el);
    } catch (err) {
      console.error(`[demos] "${name}" failed to mount`, err);
    }
  }

  nodes.forEach((n) => loader.observe(n));
}
