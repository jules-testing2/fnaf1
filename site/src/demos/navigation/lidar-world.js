// Analytic indoor scene for the lidar-scan demo: an office/lab room with a corridor, furniture as boxes,
// people and plants as vertical cylinders. Rays are intersected analytically (no meshes needed), which keeps
// the scan cheap enough to run every frame without allocations.
// Units: metres, Three.js convention (y up, floor at y = 0).

const H = 3.0;              // wall height
const T = 0.15;             // wall thickness

// [minX, minY, minZ, maxX, maxY, maxZ]
const BOXES = [
  // Room shell 16 × 10 m. East wall has a doorway into the corridor; north wall has a window band.
  [-8 - T, 0, -5 - T, -8, H, 5 + T],
  [-8, 0, 5, 8, H, 5 + T],
  [-8, 0, -5 - T, -2, 1.0, -5], [-8, 2.2, -5 - T, -2, H, -5], [-2, 0, -5 - T, 1, H, -5],
  [1, 0, -5 - T, 8, 1.0, -5], [1, 2.2, -5 - T, 8, H, -5],
  [8, 0, -5, 8 + T, H, -1.1], [8, 0, 1.1, 8 + T, H, 5], [8, 2.1, -1.1, 8 + T, H, 1.1],
  // Corridor 8 → 16 m
  [8, 0, -1.25 - T, 16, H, -1.25], [8, 0, 1.25, 16, H, 1.25 + T], [16, 0, -1.25, 16 + T, H, 1.25],
  // Desks along the north wall, with chairs
  [-7, 0, -4.8, -2.4, 0.75, -4.0], [-6.4, 0, -3.75, -5.95, 0.48, -3.3], [-6.35, 0.48, -3.32, -6.0, 0.95, -3.22],
  [-4.9, 0, -3.75, -4.45, 0.48, -3.3], [-4.85, 0.48, -3.32, -4.5, 0.95, -3.22],
  [-3.4, 0, -3.75, -2.95, 0.48, -3.3], [-3.35, 0.48, -3.32, -3.0, 0.95, -3.22],
  // Meeting table in the middle and its chairs
  [-1.6, 0.68, -0.65, 1.6, 0.76, 0.65], [-1.45, 0, -0.5, -1.3, 0.68, 0.5], [1.3, 0, -0.5, 1.45, 0.68, 0.5],
  [-1.1, 0, -1.25, -0.65, 0.48, -0.8], [0.65, 0, -1.25, 1.1, 0.48, -0.8], [-1.1, 0, 0.8, -0.65, 0.48, 1.25], [0.65, 0, 0.8, 1.1, 0.48, 1.25],
  [-1.1, 0.48, -1.3, -0.65, 0.95, -1.22], [0.65, 0.48, -1.3, 1.1, 0.95, -1.22], [-1.1, 0.48, 1.22, -0.65, 0.95, 1.3], [0.65, 0.48, 1.22, 1.1, 0.95, 1.3],
  // Cabinets on the west wall, shelves on the south wall, a couch, two columns
  [-7.95, 0, -2.8, -7.45, 2.0, 2.6],
  [1.8, 0, 4.55, 6.2, 1.85, 4.98], [1.8, 0.9, 4.2, 6.2, 0.95, 4.98],
  [3.4, 0, 1.6, 6.1, 0.45, 2.5], [3.4, 0.45, 2.3, 6.1, 0.85, 2.5], [3.4, 0.45, 1.6, 3.6, 0.65, 2.3], [5.9, 0.45, 1.6, 6.1, 0.65, 2.3],
  [-3.9, 0, 1.8, -3.5, H, 2.2], [3.3, 0, -2.2, 3.7, H, -1.8],
  // Corridor bench and a box
  [10.5, 0, 0.75, 12.5, 0.45, 1.2], [13.6, 0, -1.2, 14.2, 0.6, -0.6],
];

// [x, z, radius, height, tag] tag 1 = dynamic (person), 0 = static
const CYLS = [
  [4.2, -3.6, 0.22, 1.75, 1],
  [12.8, -0.35, 0.22, 1.7, 1],
  [-7.3, 4.4, 0.28, 0.9, 0], [7.4, -4.4, 0.28, 1.1, 0], [-1.6, 4.5, 0.25, 0.8, 0],
];

export const MAX_RANGE = 14;
const boxes = new Float32Array(BOXES.flat());
const NB = BOXES.length;

/**
 * Casts one ray. Writes the hit into `out` = { t, tag } where tag: 0 structure, 1 dynamic, 2 floor.
 * Returns false when nothing is hit within MAX_RANGE (open sky through a window, too far, or the ceiling).
 */
export function cast(ox, oy, oz, dx, dy, dz, out) {
  let best = MAX_RANGE, tag = -1;
  const ix = 1 / (dx || 1e-9), iy = 1 / (dy || 1e-9), iz = 1 / (dz || 1e-9);
  for (let b = 0; b < NB; b++) {
    const o = b * 6;
    let t1 = (boxes[o] - ox) * ix, t2 = (boxes[o + 3] - ox) * ix;
    let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
    t1 = (boxes[o + 1] - oy) * iy; t2 = (boxes[o + 4] - oy) * iy;
    tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
    t1 = (boxes[o + 2] - oz) * iz; t2 = (boxes[o + 5] - oz) * iz;
    tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmax >= Math.max(tmin, 0.05) && tmin < best) { best = Math.max(tmin, 0.05); tag = 0; }
  }
  for (let c = 0; c < CYLS.length; c++) {
    const [cx, cz, r, h, k] = CYLS[c];
    const fx = ox - cx, fz = oz - cz;
    const a = dx * dx + dz * dz, bq = 2 * (fx * dx + fz * dz), cq = fx * fx + fz * fz - r * r;
    const disc = bq * bq - 4 * a * cq;
    if (disc < 0 || a < 1e-9) continue;
    const t = (-bq - Math.sqrt(disc)) / (2 * a);
    if (t > 0.05 && t < best) { const y = oy + dy * t; if (y >= 0 && y <= h) { best = t; tag = k; } }
  }
  if (dy < -1e-6) { const t = -oy / dy; if (t < best) { best = t; tag = 2; } }
  if (tag < 0) return false;
  out.t = best; out.tag = tag;
  return true;
}

/** Closed patrol loop for the robot, through the room and a short visit into the corridor. */
export const PATROL = [
  [-5.6, -2.3], [-1.5, -2.4], [2.4, -2.9], [6.4, -2.5], [6.9, -0.2], [9.5, -0.1], [13.0, 0.35], [9.5, 0.3],
  [6.8, 0.6], [6.4, 3.5], [2.0, 3.6], [-2.2, 3.3], [-5.9, 3.1], [-6.4, 0.4],
];
