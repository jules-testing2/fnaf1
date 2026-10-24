// False-colour "thermal" rendering of a transparent cut-out: luminance is mapped through an
// ironbow-style palette and blurred slightly, the way a low-resolution thermal sensor smears edges.
// Used for the RGB vs thermal comparison on the Go2 page. Illustrative only, not sensor data.

const IRONBOW = [
  [0.0, [12, 6, 40]],
  [0.25, [84, 16, 120]],
  [0.5, [200, 40, 70]],
  [0.7, [250, 110, 20]],
  [0.88, [255, 200, 60]],
  [1.0, [255, 250, 220]],
];

function paletteLUT() {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < IRONBOW.length - 2 && t > IRONBOW[k + 1][0]) k++;
    const [t0, c0] = IRONBOW[k], [t1, c1] = IRONBOW[k + 1];
    const f = (t - t0) / (t1 - t0);
    for (let j = 0; j < 3; j++) lut[i * 3 + j] = c0[j] + (c1[j] - c0[j]) * f;
  }
  return lut;
}

/** CSS gradient matching the palette, for legends. */
export const IRONBOW_CSS = `linear-gradient(90deg, ${IRONBOW.map(([t, c]) => `rgb(${c.join(',')}) ${t * 100}%`).join(', ')})`;

/**
 * Draws `img` into both canvases, fitted (contain) and centred: `rgb` as-is, `ir` in false colour.
 * Dark, dense parts (motors, battery, sensor turret) read warm; thin bright shell reads cooler.
 */
export function renderThermalPair(img, rgb, ir, { dpr = Math.min(window.devicePixelRatio || 1, 1.5), pad = 0.08 } = {}) {
  const w = rgb.clientWidth, h = rgb.clientHeight;
  if (!w || !h) return;
  for (const c of [rgb, ir]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const W = rgb.width, H = rgb.height;
  const s = Math.min((W * (1 - pad * 2)) / img.naturalWidth, (H * (1 - pad * 2)) / img.naturalHeight);
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  const dx = (W - dw) / 2, dy = (H - dh) / 2;

  const a = rgb.getContext('2d');
  a.clearRect(0, 0, W, H);
  a.drawImage(img, dx, dy, dw, dh);

  // Work at reduced resolution (thermal sensors are coarse), then scale up with smoothing.
  const q = 0.35;
  const tw = Math.max(1, Math.round(W * q)), th = Math.max(1, Math.round(H * q));
  const tmp = document.createElement('canvas');
  tmp.width = tw; tmp.height = th;
  const t = tmp.getContext('2d', { willReadFrequently: true });
  t.filter = 'blur(1.2px)';
  t.drawImage(img, dx * q, dy * q, dw * q, dh * q);
  const data = t.getImageData(0, 0, tw, th);
  const px = data.data;
  const lut = paletteLUT();
  for (let i = 0; i < px.length; i += 4) {
    const alpha = px[i + 3] / 255;
    const lum = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
    // Invert so dark mechanical parts glow; keep a floor so the body is never ambient-cold.
    const heat = Math.min(1, 0.32 + (1 - lum) * 0.75);
    const v = Math.round(alpha > 0.05 ? heat * 255 : 0);
    px[i] = lut[v * 3]; px[i + 1] = lut[v * 3 + 1]; px[i + 2] = lut[v * 3 + 2];
    px[i + 3] = Math.round(255 * Math.min(1, alpha * 1.4));
  }
  t.filter = 'none';
  t.putImageData(data, 0, 0);

  const b = ir.getContext('2d');
  b.clearRect(0, 0, W, H);
  b.imageSmoothingEnabled = true;
  b.imageSmoothingQuality = 'high';
  b.drawImage(tmp, 0, 0, W, H);
}
