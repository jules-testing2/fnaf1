// Animated ROS 2 dataflow for the ai_tools package (Abaza, Sensors 2025, Section 2.5):
// sensor topics → ai_covariance_node (Random Forest, every 0.2 s) → /ai_tools/covariance_prediction
// → ai_covariance_updater (covariance = error²) → /ekf_node/set_parameters → ekf_node → filtered odometry.
// Markup: an <svg data-dataflow> whose <path class="df-edge"> elements carry packets in document order.
import { gsap, reducedMotion } from '../lib/motion.js';

export function initDataflow(root = document) {
  root.querySelectorAll('[data-dataflow]').forEach((svg) => {
    const edges = [...svg.querySelectorAll('.df-edge')];
    const nodes = [...svg.querySelectorAll('.df-node')];
    const readout = svg.querySelector('[data-df-readout]');
    if (reducedMotion) return;
    // Solid edges draw in; dashed ones fade in so they keep their dash pattern.
    const solid = edges.filter((e) => !e.dataset.tone);
    const dashed = edges.filter((e) => e.dataset.tone);
    gsap.set(solid, { drawSVG: '0%' });
    gsap.set(dashed, { opacity: 0 });
    const intro = gsap.timeline({ paused: true });
    intro.to(solid, { drawSVG: '100%', duration: 0.9, stagger: 0.12, ease: 'power2.inOut' })
      .to(dashed, { opacity: 1, duration: 0.8, stagger: 0.1 }, 0.4)
      .from(nodes, { opacity: 0, scale: 0.9, transformOrigin: '50% 50%', duration: 0.6, stagger: 0.08 }, 0);

    // A packet per edge, launched in stage order so the loop reads left to right.
    const loop = gsap.timeline({ paused: true, repeat: -1 });
    const stages = [...new Set(edges.map((e) => Number(e.dataset.stage)))].sort((a, b) => a - b);
    stages.forEach((stage, i) => {
      edges.filter((e) => Number(e.dataset.stage) === stage).forEach((edge) => {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('r', '5');
        dot.setAttribute('class', `df-packet df-packet--${edge.dataset.tone || 'a'}`);
        svg.appendChild(dot);
        gsap.set(dot, { opacity: 0 });
        loop.to(dot, { opacity: 1, duration: 0.1 }, i * 0.7)
          .to(dot, { motionPath: { path: edge, align: edge, alignOrigin: [0.5, 0.5] }, duration: 0.8, ease: 'power1.inOut' }, i * 0.7)
          .to(dot, { opacity: 0, duration: 0.15 }, i * 0.7 + 0.75);
      });
      const node = svg.querySelector(`.df-node[data-stage="${stage}"] rect`);
      if (node) loop.fromTo(node, { strokeOpacity: 0.35 }, { strokeOpacity: 1, duration: 0.25, yoyo: true, repeat: 1 }, i * 0.7 + 0.7);
    });
    // The readout cycles through prediction messages published by the node, as printed in Figure 9 of the paper.
    if (readout) {
      const lines = readout.dataset.lines.split('|');
      lines.forEach((line, i) => loop.call(() => (readout.textContent = line), null, i * (loop.duration() / lines.length)));
    }
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { intro.play(); loop.play(); } else loop.pause();
    }, { threshold: 0.2 }).observe(svg);
  });
}
