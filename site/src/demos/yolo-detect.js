// yolo-detect: the robot's camera with YOLO26n boxes locking onto people and furniture.
// Procedural mode renders the shared corridor through the Logitech C920 intrinsics and simulates the
// detector's real cadence on the Raspberry Pi 5 (NCNN, 5.5 +/- 0.7 FPS, 167 +/- 21 ms per inference).
// Real mode plays `options.video` and draws boxes from `options.detections` (JSON, see detector.js).
//
// Options: compact, bare, theme ("dark" | "paper"), height, aspect, video, detections, start (seconds).

import './perception/perception.css';
import { buildFrame, createLoop, applySize, palette } from './perception/common.js';
import { createCameraView } from './perception/camera-view.js';
import { classColor } from './perception/detector.js';
import { sceneAt, CLASSES, MOBILITY } from './perception/world.js';

const LABEL = 'Robot camera view of a university corridor. YOLO26n bounding boxes lock onto a walking person, chairs, a bench, '
  + 'a potted plant, a table and a bottle, each labelled with its class and confidence, at about 5.5 inferences per second.';

export default function mount(el, { options = {}, reducedMotion = false } = {}) {
  const compact = !!options.compact;
  const pal = palette(options.theme);
  const { root, right, body } = buildFrame(el, {
    title: 'YOLO26n · /yolo26/detections',
    meta: compact ? '' : 'NCNN · Raspberry Pi 5 · CPU only',
    options, kind: 'yolo',
  });
  if (right) right.insertAdjacentHTML('afterbegin', '<span class="chip chip--live pcp-chip">Live</span>');

  const stage = document.createElement('div');
  stage.className = 'pcp-stage pcp-stage--cam';
  applySize(stage, options, compact ? 16 / 10 : 16 / 9, 4 / 3);
  body.appendChild(stage);

  // A resize clears the canvas; repaint the last frame so a paused or static view never goes blank.
  let last = null;
  const view = createCameraView(stage, {
    sceneAt: (t) => sceneAt(t), compact, video: options.video, detections: options.detections, label: LABEL,
    onResize: () => { if (last !== null && !loop.playing) view.render(last, 0); },
  });

  // Legend: classes in the corridor with their mobility category (Table 4 of the paper).
  if (!compact && !options.bare) {
    const legend = document.createElement('div');
    legend.className = 'pcp-legend';
    legend.innerHTML = Object.entries(CLASSES).map(([cls, c]) => `<span class="pcp-legend__item"><i style="background:${classColor(cls, pal.tk)}"></i>${cls}<em>${c.mobility}</em></span>`).join('')
      + `<span class="pcp-legend__note mono">min conf ${0.45} · dynamic ${MOBILITY.dynamic.speed}% · static ${MOBILITY.static.speed}% · minor ${MOBILITY.minor.speed}% speed</span>`;
    body.appendChild(legend);
  }

  // Start just before the person steps out of the doorway.
  const start = options.start ?? 1.6;
  const loop = createLoop((t, dt) => { last = start + t; view.render(last, dt); });

  view.ready.then((mode) => {
    if (mode === 'video') {
      right?.querySelector('.pcp-chip')?.replaceChildren('Real footage');
      // Match the footage's aspect unless the page fixed a size.
      if (!options.aspect && !options.height) stage.style.aspectRatio = String(view.aspect);
    }
    if (reducedMotion) { if (mode === 'video') { last = 0; view.render(0, 0); } else still(); }
  });

  // Reduced motion: one meaningful frame, with the detector warmed up so every box is settled.
  function still() {
    const t = 3.9;
    for (let s = t - 2.5; s < t; s += 1 / 30) view.detector.update(s, 1 / 30);
    last = t;
    view.render(t, 0);
  }

  root.classList.add('is-ready');
  return {
    play() { if (reducedMotion) return; view.play(); loop.play(); },
    pause() { view.pause(); loop.pause(); },
    destroy() { loop.pause(); view.destroy(); root.remove(); },
  };
}
