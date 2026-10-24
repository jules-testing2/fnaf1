// Small Three.js stage helper shared by every 3D scene: renderer, camera, resize, DPR cap,
// and a render loop that only runs while the canvas is on screen and the tab is visible.

import * as THREE from 'three';

export { THREE };

/**
 * @param {HTMLElement} container  element the canvas fills (give it a size in CSS)
 * @param {object} [opts]
 * @param {number} [opts.fov=35]
 * @param {number} [opts.dpr=1.75]   max device pixel ratio
 * @param {boolean} [opts.alpha=true]
 * @param {boolean} [opts.antialias=true]
 * @returns {{renderer, scene, camera, clock, onFrame:(fn:(t:number,dt:number)=>void)=>void, start, stop, destroy, size:{w:number,h:number}}}
 */
export function createStage(container, opts = {}) {
  const { fov = 35, dpr = 1.75, alpha = true, antialias = true } = opts;
  const renderer = new THREE.WebGLRenderer({ alpha, antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, dpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 400);
  // Minimal clock (THREE.Clock is deprecated in recent three.js releases).
  const clock = { elapsedTime: 0, last: performance.now(), getDelta() { const now = performance.now(); const d = (now - this.last) / 1000; this.last = now; this.elapsedTime += d; return d; } };
  const size = { w: 1, h: 1 };
  const frames = [];
  let running = false, onScreen = true, raf = 0;

  const resize = () => {
    size.w = container.clientWidth || 1;
    size.h = container.clientHeight || 1;
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; tick(); }, { threshold: 0 });
  io.observe(container);

  function loop() {
    raf = 0;
    if (!running || !onScreen || document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    for (const f of frames) f(t, dt);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }
  function tick() { if (!raf && running && onScreen && !document.hidden) { clock.getDelta(); raf = requestAnimationFrame(loop); } }
  document.addEventListener('visibilitychange', tick);

  return {
    renderer, scene, camera, clock, size,
    onFrame: (fn) => frames.push(fn),
    start() { running = true; tick(); },
    stop() { running = false; },
    renderOnce() { for (const f of frames) f(clock.elapsedTime, 0); renderer.render(scene, camera); },
    destroy() {
      running = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', tick);
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
