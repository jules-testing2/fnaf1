// The four Xplorer builds. Copy and spec rows come from the lab's product sheet (old site);
// `twin` holds the proportions of the procedural 3D twin, loosely matched to the lab photos.

export const BUILDS = [
  {
    id: 'a', name: 'Xplorer A', tag: 'Indoor', env: 'indoor', img: 'img/xplorer-a.webp', w: 355, h: 234,
    desc: 'Lightweight AMR for indoor mapping and inspection, the entry platform for facilities getting started with autonomy. Built to run SLAM and inspection routes on a single charge, with minimal setup.',
    payload: 25, runtime: 12,
    rows: [['Sensing', 'LiDAR + stereo camera'], ['Speed', '1.2 m/s'], ['Environment', 'Indoor, flat floors']],
    twin: { len: 0.46, wid: 0.36, hei: 0.1, clear: 0.07, wheel: 0.068, wheelW: 0.055, knobby: 0, body: '#1d6fe0', top: '#1a1a1d', shell: 0, pucks: [[0.15, 0, 0]], mast: 0 },
  },
  {
    id: 'b', name: 'Xplorer B', tag: 'Warehouse', env: 'warehouse', img: 'img/xplorer-b.webp', w: 398, h: 458,
    desc: 'Warehouse-grade mobile robot built for repeat logistics routes, fleet coordination, and dock-to-shelf transport. Coordinates with other units through the Autonomy Stack’s shared map.',
    payload: 150, runtime: 10,
    rows: [['Fleet size', 'Up to 40 units'], ['Charging', 'Auto-dock'], ['Environment', 'Warehouse, mixed traffic']],
    twin: { len: 0.54, wid: 0.5, hei: 0.15, clear: 0.09, wheel: 0.088, wheelW: 0.07, knobby: 1, body: '#2b86ea', top: '#2b86ea', shell: 0, pucks: [[0.02, 0.06, 0], [-0.2, 0, 0.18], [-0.2, 0, -0.18]], mast: 1 },
  },
  {
    id: 'c', name: 'Xplorer C', tag: 'Outdoor', env: 'outdoor', img: 'img/xplorer-c.webp', w: 284, h: 197,
    desc: 'Ruggedized platform rated for uneven ground and outdoor weather, for perimeter patrol and site inspection where a wheeled indoor robot would fail.',
    payload: 60, runtime: 8,
    rows: [['Rating', 'IP65'], ['Terrain', 'Gravel, slopes to 20°'], ['Environment', 'Outdoor, all-weather']],
    twin: { len: 0.5, wid: 0.36, hei: 0.12, clear: 0.05, wheel: 0.058, wheelW: 0.045, knobby: 0, body: '#202024', top: '#202024', shell: 1, pucks: [[0.05, 0.1, 0]], mast: 0 },
  },
  {
    id: 'd', name: 'Xplorer D', tag: 'Field', env: 'field', img: 'img/xplorer-d.webp', w: 353, h: 233,
    desc: 'Full off-road autonomy for unstructured terrain, the flagship Xplorer for defense and field-research deployments, built for long, unattended missions.',
    payload: 220, runtime: 48,
    rows: [['Drivetrain', '4x4, independent suspension'], ['Comms', 'Long-range mesh'], ['Environment', 'Unstructured field terrain']],
    twin: { len: 0.5, wid: 0.38, hei: 0.11, clear: 0.08, wheel: 0.07, wheelW: 0.06, knobby: 1, body: '#d8ccb2', top: '#cbbd9f', shell: 0, pucks: [[0.15, 0, 0]], mast: 0 },
  },
];

export const MAX_PAYLOAD = Math.max(...BUILDS.map((b) => b.payload));
export const MAX_RUNTIME = Math.max(...BUILDS.map((b) => b.runtime));

/** Reads a build id from the URL hash: #b, #xb, #xplorer-b, #build-b all select Xplorer B. */
export function buildFromHash(hash = location.hash) {
  const m = /^#(?:x|xplorer-|build-)?([a-d])(?:-detail)?$/i.exec(hash);
  return m ? m[1].toLowerCase() : null;
}
