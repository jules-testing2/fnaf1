// Procedural low-poly Xplorer chassis: body, deck plate, optional front shell, four wheels,
// LiDAR pucks, a front camera and an optional camera mast. Every part is a unit mesh scaled
// from a parameter set, so builds can morph smoothly into each other (see xplorer-builds.js).
// Units are metres; the robot faces +X and sits on y = 0.

import { THREE } from '../../lib/stage.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const MAX_PUCKS = 3;

/** Linear blend of two twin parameter sets (colours as THREE.Color, pucks padded to MAX_PUCKS). */
export function blendTwin(a, b, t) {
  const out = {};
  for (const k of ['len', 'wid', 'hei', 'clear', 'wheel', 'wheelW', 'knobby', 'shell', 'mast']) out[k] = a[k] + (b[k] - a[k]) * t;
  for (const k of ['body', 'top']) out[k] = new THREE.Color(a[k]).lerp(new THREE.Color(b[k]), t);
  out.pucks = [];
  for (let i = 0; i < MAX_PUCKS; i++) {
    const pa = a.pucks[i], pb = b.pucks[i];
    const from = pa || pb || a.pucks[0], to = pb || pa || b.pucks[0];
    const sa = pa ? 1 : 0, sb = pb ? 1 : 0;
    out.pucks.push({ p: from.map((v, j) => v + (to[j] - v) * t), s: sa + (sb - sa) * t });
  }
  return out;
}

export function createXplorerModel(initial) {
  const group = new THREE.Group();
  const mat = {
    body: new THREE.MeshStandardMaterial({ color: initial.body, roughness: 0.5, metalness: 0.08 }),
    top: new THREE.MeshStandardMaterial({ color: initial.top, roughness: 0.7, metalness: 0.05 }),
    shell: new THREE.MeshStandardMaterial({ color: '#4fb3e8', roughness: 0.45, metalness: 0.05 }),
    tyre: new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.95 }),
    tread: new THREE.MeshStandardMaterial({ color: '#1c1c1f', roughness: 0.9, flatShading: true }),
    hub: new THREE.MeshStandardMaterial({ color: '#8d8a84', roughness: 0.4, metalness: 0.6 }),
    puck: new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.35, metalness: 0.3 }),
    lens: new THREE.MeshStandardMaterial({ color: '#0b0b0c', emissive: '#5bc0eb', emissiveIntensity: 0.9 }),
  };

  const unitRound = new RoundedBoxGeometry(1, 1, 1, 3, 0.12);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 28);
  const knobCyl = new THREE.CylinderGeometry(1, 1, 1, 12);

  const body = new THREE.Mesh(unitRound, mat.body);
  const deck = new THREE.Mesh(unitBox, mat.top);
  const shell = new THREE.Mesh(unitRound, mat.shell);
  group.add(body, deck, shell);

  const wheels = [];
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Group();
    const tyre = new THREE.Mesh(unitCyl, mat.tyre);
    const tread = new THREE.Mesh(knobCyl, mat.tread);
    const hub = new THREE.Mesh(unitCyl, mat.hub);
    [tyre, tread, hub].forEach((m) => (m.rotation.x = Math.PI / 2));
    w.add(tyre, tread, hub);
    w.userData = { tyre, tread, hub, side: i < 2 ? 1 : -1, end: i % 2 ? -1 : 1 };
    wheels.push(w);
    group.add(w);
  }

  const pucks = [];
  for (let i = 0; i < MAX_PUCKS; i++) {
    const p = new THREE.Group();
    const base = new THREE.Mesh(unitCyl, mat.puck);
    base.scale.set(0.036, 0.034, 0.036);
    const ring = new THREE.Mesh(unitCyl, mat.hub);
    ring.scale.set(0.038, 0.006, 0.038);
    ring.position.y = -0.014;
    p.add(base, ring);
    pucks.push(p);
    group.add(p);
  }

  const cam = new THREE.Group();
  const camBody = new THREE.Mesh(unitBox, mat.puck);
  camBody.scale.set(0.03, 0.03, 0.09);
  const lens = new THREE.Mesh(unitCyl, mat.lens);
  lens.rotation.z = Math.PI / 2;
  lens.scale.set(0.011, 0.006, 0.011);
  lens.position.x = 0.016;
  cam.add(camBody, lens);
  group.add(cam);

  const mast = new THREE.Group();
  const pole = new THREE.Mesh(unitBox, mat.puck);
  pole.scale.set(0.03, 0.34, 0.03);
  pole.position.y = 0.17;
  const head = new THREE.Mesh(unitBox, mat.puck);
  head.scale.set(0.05, 0.04, 0.11);
  head.position.y = 0.35;
  const headLens = lens.clone();
  headLens.position.set(0.03, 0.35, 0);
  mast.add(pole, head, headLens);
  group.add(mast);

  // Reference points other scenes read: the main LiDAR and the front camera.
  const lidar = new THREE.Object3D();
  pucks[0].add(lidar);
  const camera = new THREE.Object3D();
  cam.add(camera);

  const state = { top: 0 };

  function apply(p) {
    const bodyY = p.clear + p.hei / 2;
    const top = p.clear + p.hei;
    state.top = top;
    body.scale.set(p.len, p.hei, p.wid);
    body.position.y = bodyY;
    deck.scale.set(p.len * 0.62, 0.008, p.wid * 0.7);
    deck.position.set(-p.len * 0.04, top + 0.003, 0);
    const s = Math.max(p.shell, 0.0001);
    shell.scale.set(p.len * 0.36 * s, p.hei * 1.3 * s, p.wid * 1.03 * s);
    shell.position.set(p.len * 0.34, p.clear + p.hei * 0.62, 0);
    shell.visible = p.shell > 0.01;
    mat.body.color.copy(p.body);
    mat.top.color.copy(p.top);

    wheels.forEach((w) => {
      const { tyre, tread, hub, side, end } = w.userData;
      w.position.set(end * p.len * 0.36, p.wheel, side * (p.wid / 2 + p.wheelW * 0.3));
      tyre.scale.set(p.wheel, p.wheelW, p.wheel);
      const k = p.knobby;
      tread.scale.set(p.wheel * (0.96 + 0.08 * k), p.wheelW * 0.92 * Math.max(k, 0.0001), p.wheel * (0.96 + 0.08 * k));
      tread.visible = k > 0.01;
      hub.scale.set(p.wheel * 0.5, p.wheelW * 1.04, p.wheel * 0.5);
    });

    p.pucks.forEach(({ p: [x, dy, z], s: sc }, i) => {
      pucks[i].position.set(x * (p.len / 0.5), top + dy + 0.02, z * (p.wid / 0.5));
      pucks[i].scale.setScalar(Math.max(sc, 0.0001));
      pucks[i].visible = sc > 0.01;
    });

    cam.position.set(p.len / 2 + 0.005 + p.shell * p.len * 0.02, p.clear + p.hei * 0.55, 0);
    mast.position.set(-p.len * 0.3, top, p.wid * 0.25);
    mast.scale.setScalar(Math.max(p.mast, 0.0001));
    mast.visible = p.mast > 0.01;
  }

  apply(blendTwin(initial, initial, 0));

  return {
    group, apply, lidar, camera, state,
    /** Spins the wheels by a travelled distance in metres. */
    roll(dist, p) { wheels.forEach((w) => (w.rotation.z = -dist / Math.max(p.wheel, 0.01))); },
  };
}
