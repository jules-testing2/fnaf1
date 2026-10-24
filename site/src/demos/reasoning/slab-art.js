// Canvas artwork drawn on the top face of each SAS slab, so every layer shows what it does at a glance:
// L0 chassis, L1 route graph, L2 scan + detection boxes, L3 resolver cascade vs VLM, L4 terminal, L5 memory cells.
const W = 512, H = 346;

function base(ctx, color) {
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.font = '600 22px "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace';
  // Faint grid gives the "engineering plate" look.
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.lineWidth = 1;
  for (let x = 32; x < W; x += 32) { ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x, H - 18); ctx.stroke(); }
  for (let y = 26; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(18, y); ctx.lineTo(W - 18, y); ctx.stroke(); }
  ctx.restore();
}

function label(ctx, text, x, y, alpha = 0.9, size = 22) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `600 ${size}px "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace`;
  ctx.fillText(text, x, y);
  ctx.restore();
}

const roundRect = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };

const ART = [
  // L0 · mobile platform: wheels, chassis, LiDAR puck, compute board.
  (ctx) => {
    ctx.globalAlpha = 0.85;
    roundRect(ctx, 140, 70, 232, 206, 26); ctx.stroke();
    for (const [x, y] of [[112, 90], [372, 90], [112, 220], [372, 220]]) { roundRect(ctx, x, y, 28, 64, 8); ctx.fill(); }
    ctx.beginPath(); ctx.arc(256, 140, 26, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(256, 140, 9, 0, Math.PI * 2); ctx.fill();
    roundRect(ctx, 206, 196, 100, 52, 6); ctx.stroke();
    label(ctx, 'RPi 5', 222, 230, 0.8, 18);
    label(ctx, 'L0', 28, 46);
  },
  // L1 · navigation execution: route graph with one lit path.
  (ctx) => {
    const n = [[70, 90], [170, 70], [270, 100], [380, 80], [450, 150], [90, 210], [200, 190], [300, 230], [420, 270], [150, 290]];
    const e = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 2], [6, 7], [7, 8], [4, 8], [5, 9], [9, 7], [1, 6]];
    ctx.globalAlpha = 0.35;
    for (const [a, b] of e) { ctx.beginPath(); ctx.moveTo(...n[a]); ctx.lineTo(...n[b]); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(...n[0]); [5, 6, 7, 8].forEach((i) => ctx.lineTo(...n[i])); ctx.stroke();
    ctx.lineWidth = 2;
    n.forEach(([x, y], i) => { ctx.beginPath(); ctx.arc(x, y, i === 8 ? 11 : 7, 0, Math.PI * 2); i === 8 ? ctx.stroke() : ctx.fill(); });
    label(ctx, 'L1', 28, 46);
  },
  // L2 · perception: LiDAR rays, returns, a detection box projected to a sector.
  (ctx) => {
    const cx = 200, cy = 190;
    ctx.globalAlpha = 0.25;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 24) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 150, cy + Math.sin(a) * 120); ctx.stroke(); }
    ctx.globalAlpha = 0.9;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 40) {
      const r = 110 + Math.sin(a * 3) * 18;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 1.2, cy + Math.sin(a) * r * 0.8, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 160, -0.55, -0.15); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1; ctx.lineWidth = 3;
    ctx.strokeRect(352, 70, 120, 150);
    label(ctx, 'YOLO26n', 354, 62, 0.9, 16);
    label(ctx, 'ASF', 400, 250, 0.9, 18);
    label(ctx, 'L2', 28, 46);
  },
  // L3 · semantic reasoning: L3a seven-step cascade | L3b VLM escalation.
  (ctx) => {
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(300, 40); ctx.lineTo(300, 310); ctx.stroke();
    ctx.globalAlpha = 1;
    label(ctx, 'L3a', 40, 80, 1, 26);
    for (let i = 0; i < 7; i++) {
      roundRect(ctx, 40 + (i % 4) * 60, 110 + Math.floor(i / 4) * 70, 48, 48, 8);
      i === 0 ? ctx.fill() : ctx.stroke();
    }
    label(ctx, 'S0–S6', 40, 290, 0.8, 18);
    label(ctx, 'L3b', 330, 80, 1, 26);
    ctx.beginPath(); ctx.ellipse(400, 170, 62, 36, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(400, 170, 16, 0, Math.PI * 2); ctx.fill();
    label(ctx, 'VLM', 376, 260, 0.8, 18);
  },
  // L4 · mission interface: terminal prompt and an instruction bubble.
  (ctx) => {
    roundRect(ctx, 60, 70, 392, 210, 18); ctx.globalAlpha = 0.85; ctx.stroke();
    ctx.globalAlpha = 1;
    label(ctx, '>_ mission', 90, 130, 1, 24);
    ctx.globalAlpha = 0.5;
    [180, 214, 248].forEach((y, i) => { ctx.fillRect(90, y - 10, [300, 230, 260][i], 8); });
    label(ctx, 'L4', 28, 46);
  },
  // L5 · operational memory: five cells, shared M1-M3, platform-aware M4-M5.
  (ctx) => {
    ['M1', 'M2', 'M3', 'M4', 'M5'].forEach((m, i) => {
      const x = 40 + (i < 3 ? i * 150 : 115 + (i - 3) * 150), y = i < 3 ? 80 : 200;
      ctx.globalAlpha = i === 2 ? 1 : 0.7;
      roundRect(ctx, x, y, 130, 88, 14);
      i === 2 ? (ctx.globalAlpha = 0.35, ctx.fill(), ctx.globalAlpha = 1, ctx.stroke()) : ctx.stroke();
      label(ctx, m, x + 44, y + 54, 1, 26);
    });
    label(ctx, 'L5', 28, 46);
  },
];

/** Draws layer `i` into a new canvas and returns it (used as a THREE.CanvasTexture source). */
export function drawSlabArt(i, color, canvas = document.createElement('canvas')) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  base(ctx, color);
  ART[i](ctx);
  return canvas;
}
