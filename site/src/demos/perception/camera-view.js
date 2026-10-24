// A self-contained "robot camera" panel used by yolo-detect and sensor-montage: procedural feed or real
// video underneath, YOLO boxes on top, then sensor grain, vignette and a telemetry HUD.

import { createCanvas, readTokens, clamp, clock, noise1 } from './common.js';
import { renderCamera, detectCandidates } from './camera.js';
import { SimDetector, VideoTracks, drawDetections } from './detector.js';
import { CAM } from './world.js';

const UPTIME = 1742.2; // the HUD clock starts mid-run, like a recording would

/** One small tile with film grain and faint scanlines, so the sensor texture costs a single fill per frame. */
function makeSensorTile() {
  const c = document.createElement('canvas');
  c.width = c.height = 192;
  const g = c.getContext('2d'), img = g.createImageData(192, 192);
  for (let y = 0; y < 192; y++) {
    for (let x = 0; x < 192; x++) {
      const i = (y * 192 + x) * 4, v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = y % 3 === 0 ? 34 : 14; // darker every third row = scanline
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * @param {HTMLElement} host  element to fill (sized by the caller)
 * @param {object} o
 * @param {(t:number)=>object} o.sceneAt   scene provider for procedural mode
 * @param {boolean} [o.compact]            smaller HUD, no cadence strip
 * @param {string} [o.video]               mp4 URL for real footage
 * @param {string} [o.detections]          detections JSON URL for real footage
 */
export function createCameraView(host, { sceneAt, compact = false, video, detections, label, onResize }) {
  const tk = readTokens();
  const tile = makeSensorTile();
  let mode = 'sim', vid = null, tracks = null;
  // Two layers: the camera image at the C920's configured 640 px width (cheap to raster, and as soft as
  // the real feed), and a full-DPR overlay so boxes, labels and HUD text stay crisp.
  const image = createCanvas(host, { maxWidth: CAM.width });
  image.canvas.setAttribute('aria-hidden', 'true');
  const view = createCanvas(host, { label, onResize: () => onResize?.() });
  const { ctx, size } = view;
  const sensor = image.ctx.createPattern(tile, 'repeat');

  const detector = new SimDetector((tc) => detectCandidates(sceneAt(tc), size.w / size.h));

  // Real footage: video element under a transparent canvas; falls back to the simulation on any error.
  const ready = (async () => {
    if (!video || !detections) return mode;
    try {
      const res = await fetch(detections);
      if (!res.ok) throw new Error(`detections ${res.status}`);
      tracks = new VideoTracks(await res.json());
      vid = document.createElement('video');
      Object.assign(vid, { src: video, muted: true, loop: true, playsInline: true, preload: 'auto' });
      vid.setAttribute('muted', ''); vid.setAttribute('playsinline', '');
      vid.className = 'pcp-video';
      vid.setAttribute('aria-hidden', 'true');
      host.insertBefore(vid, view.canvas);
      image.canvas.hidden = true;
      await new Promise((ok, fail) => { vid.addEventListener('loadeddata', ok, { once: true }); vid.addEventListener('error', fail, { once: true }); });
      mode = 'video';
      host.classList.add('is-video');
    } catch (err) {
      console.warn('[yolo-detect] real footage unavailable, using the simulation', err);
      vid?.remove(); vid = null; tracks = null;
    }
    return mode;
  })();

  function hud(t, rect, info) {
    const f = clamp(Math.round(rect.w / 64), 9, 12);
    const pad = Math.round(f * 1.2);
    ctx.save();
    ctx.font = `500 ${f}px "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace`;
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4;
    const text = (s, x, y, align = 'left', col = 'rgba(255,255,255,0.86)') => { ctx.textAlign = align; ctx.fillStyle = col; ctx.fillText(s, x, y); };
    // Corner brackets of the viewfinder.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
    const L = f * 1.6, m = pad * 0.6;
    ctx.beginPath();
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [rect.w - m, m, -1, 1], [m, rect.h - m, 1, -1], [rect.w - m, rect.h - m, -1, -1]]) {
      ctx.moveTo(rect.x + x, rect.y + y + sy * L); ctx.lineTo(rect.x + x, rect.y + y); ctx.lineTo(rect.x + x + sx * L, rect.y + y);
    }
    ctx.stroke();
    // Principal point (cx = 308.11 px, a little left of the image centre).
    const px = rect.x + (CAM.cx / CAM.width) * rect.w, py = rect.y + rect.h / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px - 7, py); ctx.lineTo(px + 7, py); ctx.moveTo(px, py - 7); ctx.lineTo(px, py + 7); ctx.stroke();

    const top = rect.y + pad + f * 0.4, bottom = rect.y + rect.h - pad - f * 0.4;
    const narrow = compact || rect.w < 560;
    const blink = Math.floor(t * 1.6) % 2 === 0;
    ctx.fillStyle = blink ? tk.danger : 'rgba(255,77,94,0.35)';
    ctx.beginPath(); ctx.arc(rect.x + pad + 4, top, 3.5, 0, Math.PI * 2); ctx.fill();
    text(narrow ? info.source : `${info.source}  ·  ${info.res}`, rect.x + pad + 13, top);
    text(info.clock, rect.x + rect.w - pad, top, 'right');
    if (!compact) text(`FRM ${String(info.frame).padStart(6, '0')}`, rect.x + rect.w - pad, top + f * 1.5, 'right', 'rgba(255,255,255,0.6)');
    text(info.model || (narrow ? 'YOLO26n · NCNN' : 'YOLO26n · NCNN · 416×416 · RPi 5 CPU'), rect.x + pad, bottom);
    ctx.fillStyle = tk.amber;
    text(info.rate, rect.x + rect.w - pad, bottom, 'right', tk.amber);

    // Cadence strip: camera frames at 30 Hz vs YOLO inferences at ~5.5 Hz, last 2 s.
    if (!compact && info.inferences && rect.w > 520) {
      const w = Math.min(220, rect.w * 0.26), x0 = rect.x + rect.w / 2 - w / 2, y0 = bottom - f * 0.2, span = 2;
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x0 - 8, y0 - f * 2.7, w + 16, f * 3.3);
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      const fr = Math.floor(info.time * CAM.rate);
      for (let k = 0; k < span * CAM.rate; k++) { const x = x0 + w - ((info.time - (fr - k) / CAM.rate) / span) * w; if (x >= x0) ctx.fillRect(x, y0 - 3, 1, 4); }
      ctx.fillStyle = tk.orange;
      for (const ti of info.inferences) { const x = x0 + w - ((info.time - ti) / span) * w; if (x >= x0 && x <= x0 + w) ctx.fillRect(x - 1, y0 - f * 1.05, 2, f * 1.05 + 1); }
      ctx.font = `500 ${f - 2}px "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace`;
      text('CAM 30 Hz', x0, y0 - f * 1.95, 'left', 'rgba(255,255,255,0.6)');
      text('YOLO26n ~5.5 Hz', x0 + w, y0 - f * 1.95, 'right', tk.orange);
    }
    ctx.restore();
  }

  function fx(ctx, t, rect) {
    ctx.save();
    // Grain + scanlines (one tiled fill, jittered each frame), a soft rolling band and a vignette:
    // a USB webcam, not a render.
    const ox = Math.floor(Math.random() * 64), oy = 3 * Math.floor(Math.random() * 21);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = sensor;
    ctx.translate(-ox, -oy); ctx.fillRect(rect.x + ox, rect.y + oy, rect.w, rect.h); ctx.translate(ox, oy);
    ctx.globalAlpha = 1;
    const by = rect.y + ((t * 0.12) % 1.3 - 0.15) * rect.h;
    const band = ctx.createLinearGradient(0, by - 40, 0, by + 40);
    band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(0.5, 'rgba(255,255,255,0.035)'); band.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = band; ctx.fillRect(rect.x, by - 40, rect.w, 80);
    const vg = ctx.createRadialGradient(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.h * 0.35, rect.x + rect.w / 2, rect.y + rect.h / 2, Math.hypot(rect.w, rect.h) * 0.62);
    vg.addColorStop(0, 'rgba(8,14,24,0)'); vg.addColorStop(1, 'rgba(8,14,24,0.58)');
    ctx.fillStyle = vg; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }

  function render(t, dt) {
    const rect = { x: 0, y: 0, w: size.w, h: size.h };
    ctx.clearRect(0, 0, size.w, size.h);
    if (mode === 'video') {
      const vt = vid.currentTime;
      drawDetections(ctx, rect, tracks.at(vt), vt, tk, { font: clamp(Math.round(size.w / 58), 9, 12) });
      hud(t, rect, { source: 'REAL FOOTAGE', res: `${tracks.width}×${tracks.height}`, clock: clock(vt), frame: Math.floor(vt * tracks.fps), rate: 'offline detections', model: tracks.model || 'YOLO · offline' });
      return;
    }
    // Wheel vibration on terrazzo: a few hundredths of a degree of pitch shake.
    const shake = noise1(t * 9, 3) * 0.0022 + noise1(t * 23, 5) * 0.0009;
    const ic = image.ctx, irect = { x: 0, y: 0, w: image.size.w, h: image.size.h };
    renderCamera(ic, irect, sceneAt(t), { shake });
    fx(ic, t, irect);
    detector.update(t, dt);
    drawDetections(ctx, rect, detector.list(), t, tk, { font: clamp(Math.round(size.w / 58), 9, 12) });
    hud(t, rect, {
      source: '/camera/image_raw', res: `${CAM.width}×${CAM.height} · 30 Hz`, clock: clock(UPTIME + t), frame: Math.floor((UPTIME + t) * CAM.rate),
      rate: `${detector.fps.toFixed(1)} FPS · ${Math.round(detector.ms)} ms`, inferences: detector.inferences, time: t,
    });
  }

  return {
    render, ready, detector, canvas: view.canvas,
    get mode() { return mode; },
    get aspect() { return tracks ? tracks.width / tracks.height : size.w / size.h; },
    play() { if (vid) vid.play().catch(() => {}); },
    pause() { vid?.pause(); },
    destroy() { vid?.pause(); vid?.remove(); image.destroy(); view.destroy(); },
  };
}
