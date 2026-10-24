// Entry point every page calls first: `import { initSite } from '../lib/site.js'; initSite();`
// It mounts the shared chrome and motion engine. Page-specific code runs after it.

import '../styles/base.css';
import { mountChrome } from './chrome.js';
import { initSmoothScroll, initMotion, initScrollChrome, initCursor, initPageTransitions, ScrollTrigger } from './motion.js';
import { initDemos } from './demos.js';

export function initSite() {
  document.documentElement.classList.add('js-motion');
  mountChrome();
  initSmoothScroll();
  initPageTransitions();
  initScrollChrome();
  initCursor();
  initMotion();
  initDemos();
  // Fonts and lazy images change layout after load; keep trigger positions honest.
  document.fonts.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener('load', () => ScrollTrigger.refresh());
}

export * from './motion.js';
