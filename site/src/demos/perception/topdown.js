// Top-down (map frame) drawing helpers shared by asf-fusion and the montage's LiDAR panel:
// floor grid, corridor walls, object footprints, the robot, the 360 deg scan and angular wedges.

import { BAY, HALF_W, DOORS, CAM, LIDAR, CLASSES, personJoints } from './world.js';
import { rgba } from './common.js';

/** Maps a world box onto a screen rect (uniform scale, centred). y is up in the world, down on screen. */
export function makeView(rect, box) {
  const sx = rect.w / (box.x1 - box.x0), sy = rect.h / (box.y1 - box.y0);
  const s = Math.max(1, Math.min(sx, sy)); // never degenerate, even before the first layout
  const cxw = (box.x0 + box.x1) / 2, cyw = (box.y0 + box.y1) / 2;
  const ox = rect.x + rect.w / 2, oy = rect.y + rect.h / 2;
  return {
    s, rect,
    X: (x) => ox + (x - cxw) * s,
    Y: (y) => oy - (y - cyw) * s,
    // Visible world extents (wider than the box on the long axis).
    x0: cxw - rect.w / 2 / s, x1: cxw + rect.w / 2 / s, y0: cyw - rect.h / 2 / s, y1: cyw + rect.h / 2 / s,
  };
}

export function drawGrid(ctx, v, pal, step = 0.5) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal.line;
  ctx.beginPath();
  for (let x = Math.ceil(v.x0 / step) * step; x <= v.x1; x += step) { const X = Math.round(v.X(x)) + 0.5; ctx.moveTo(X, v.rect.y); ctx.lineTo(X, v.rect.y + v.rect.h); }
  for (let y = Math.ceil(v.y0 / step) * step; y <= v.y1; y += step) { const Y = Math.round(v.Y(y)) + 0.5; ctx.moveTo(v.rect.x, Y); ctx.lineTo(v.rect.x + v.rect.w, Y); }
  ctx.stroke();
  ctx.restore();
}

/** Corridor walls with doorway gaps, and the outline of the rooms behind them. */
export function drawWalls(ctx, v, pal) {
  ctx.save();
  ctx.lineCap = 'round';
  for (let b = Math.floor(v.x0 / BAY) - 1; b <= Math.floor(v.x1 / BAY) + 1; b++) {
    const ox = b * BAY;
    for (const side of [1, -1]) {
      const y = side * HALF_W;
      const doors = DOORS.filter((d) => d.side === side);
      let x = ox;
      ctx.strokeStyle = pal.lineStrong; ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (const d of doors) { ctx.moveTo(v.X(x), v.Y(y)); ctx.lineTo(v.X(ox + d.x0), v.Y(y)); x = ox + d.x1; }
      ctx.moveTo(v.X(x), v.Y(y)); ctx.lineTo(v.X(ox + BAY), v.Y(y));
      ctx.stroke();
      ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.strokeStyle = pal.line;
      ctx.beginPath();
      for (const d of doors) {
        const cx = ox + (d.x0 + d.x1) / 2, yb = side * (HALF_W + 3);
        ctx.moveTo(v.X(cx - 2), v.Y(y)); ctx.lineTo(v.X(cx - 2), v.Y(yb)); ctx.lineTo(v.X(cx + 2), v.Y(yb)); ctx.lineTo(v.X(cx + 2), v.Y(y));
      }
      ctx.stroke(); ctx.setLineDash([]);
    }
  }
  ctx.restore();
}

/** Faint ground-truth footprints of the furniture (what the robot does not know yet). */
export function drawFootprints(ctx, v, scene, pal, { alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = pal.lineStrong; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
  for (const o of scene.objects) {
    if (o.x < v.x0 - 1 || o.x > v.x1 + 1) continue;
    ctx.beginPath();
    if (o.kind === 'plant' || o.kind === 'bottle') ctx.arc(v.X(o.x), v.Y(o.y), Math.max(2, (o.kind === 'plant' ? 0.17 : o.r) * v.s), 0, Math.PI * 2);
    else ctx.rect(v.X(o.x - o.sx / 2), v.Y(o.y + o.sy / 2), o.sx * v.s, o.sy * v.s);
    ctx.stroke();
  }
  if (scene.person) {
    const j = personJoints(scene.person, scene.t);
    ctx.beginPath(); ctx.ellipse(v.X(j.pelvis[0]), v.Y(j.pelvis[1]), 0.22 * v.s, 0.22 * v.s, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

/** Xplorer footprint with the co-located camera and LiDAR (Figure 3a of the paper). */
export function drawRobot(ctx, v, robot, pal, { accent }) {
  ctx.save();
  ctx.translate(v.X(robot.x), v.Y(robot.y));
  ctx.rotate(-robot.yaw);
  const L = 0.5 * v.s, W = 0.34 * v.s;
  ctx.fillStyle = pal.paper ? '#fffaf0' : '#1e1e22';
  ctx.strokeStyle = pal.fg; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(-0.23 * v.s, -W / 2, L, W, Math.max(2, v.s * 0.04)); ctx.fill(); ctx.stroke();
  // Four wheels (4WD differential drive).
  ctx.fillStyle = pal.fg;
  for (const wx of [-0.13, 0.13]) for (const sy of [-1, 1]) ctx.fillRect(wx * v.s - 0.05 * v.s, sy > 0 ? W / 2 : -W / 2 - 0.04 * v.s, 0.1 * v.s, 0.04 * v.s);
  // LiDAR (ring) and camera (square) on the forward axis.
  // They sit 6 mm apart, so the camera mark is nudged forward a few pixels to stay readable.
  const lx = LIDAR.x * v.s, cx = CAM.x * v.s + 5;
  ctx.strokeStyle = accent; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(lx, 0, Math.max(3, 0.045 * v.s), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = accent; ctx.fillRect(cx - 2.5, -2.5, 5, 5);
  ctx.restore();
}

/** Points of a /scan message; `style(i, r)` returns [colour, radius] or null to skip a point. */
export function drawScan(ctx, v, scan, style) {
  const { pose, ranges } = scan;
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (!Number.isFinite(r)) continue;
    const a = pose.yaw + LIDAR.angleMin + i * LIDAR.inc;
    const x = pose.x + Math.cos(a) * r, y = pose.y + Math.sin(a) * r;
    if (x < v.x0 - 0.2 || x > v.x1 + 0.2 || y < v.y0 - 0.2 || y > v.y1 + 0.2) continue;
    const st = style(i, r, a);
    if (!st) continue;
    ctx.fillStyle = st[0];
    ctx.beginPath(); ctx.arc(v.X(x), v.Y(y), st[1], 0, Math.PI * 2); ctx.fill();
  }
}

/** A wedge from a sensor pose between two sensor-frame angles. */
export function wedge(ctx, v, pose, a0, a1, range) {
  const X = v.X(pose.x), Y = v.Y(pose.y);
  ctx.beginPath();
  ctx.moveTo(X, Y);
  ctx.arc(X, Y, range * v.s, -(pose.yaw + a1), -(pose.yaw + a0));
  ctx.closePath();
}

/** Rotating sweep glow for the spinning LiDAR head. */
export function drawSweep(ctx, v, pose, angle, color, range = 7, strength = 0.22) {
  const X = v.X(pose.x), Y = v.Y(pose.y), R = range * v.s;
  ctx.save();
  if (ctx.createConicGradient) {
    const g = ctx.createConicGradient(-angle, X, Y);
    g.addColorStop(0, rgba(color, strength)); g.addColorStop(0.12, rgba(color, 0)); g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(X, Y, R, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = rgba(color, 0.5); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + Math.cos(-angle) * R, Y + Math.sin(-angle) * R); ctx.stroke();
  ctx.restore();
}

export const mobilityOf = (cls) => CLASSES[cls]?.mobility || 'static';
