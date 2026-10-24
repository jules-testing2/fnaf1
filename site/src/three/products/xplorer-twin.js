// Xplorer digital twin: the procedural chassis on a slowly turning turntable inside a small room
// with a few obstacles. "Sensor view" overlays what the lab robots actually sense: a 2D LiDAR
// with 360° coverage and ~503 rays per revolution, and the camera's 49.8° horizontal field of view
// (both from the Sensors 2026 paper). The sweep is slowed down so the eye can follow it.

import { createStage, THREE } from '../../lib/stage.js';
import { gsap } from '../../lib/motion.js';
import { createXplorerModel, blendTwin } from './xplorer-model.js';

const RAYS = 503;
const HALF_FOV = (24.9 * Math.PI) / 180;
const ROOM = 1.7; // half-size of the square room, metres

// Obstacle footprints in the room (x, z in metres): boxes {x,z,w,d,h} and cylinders {x,z,r,h}.
const OBSTACLES = [
  { x: 1.0, z: 0.3, w: 0.4, d: 0.4, h: 0.85 },        // chair
  { x: 0.75, z: -0.7, r: 0.18, h: 1.7 },              // person
  { x: -0.8, z: 0.9, r: 0.18, h: 0.75 },              // potted plant
  { x: -1.05, z: -0.65, w: 0.8, d: 0.5, h: 0.75 },    // table
  { x: 0.25, z: 1.2, w: 1.0, d: 0.28, h: 0.45 },      // bench
];

/** Distance along a 2D ray from (ox, oz) at angle a to the first obstacle or wall. */
function castRay(ox, oz, a) {
  const dx = Math.cos(a), dz = -Math.sin(a);
  let best = Infinity;
  // Room walls.
  for (const [n, d] of [[dx, ROOM - ox], [-dx, ROOM + ox], [dz, ROOM - oz], [-dz, ROOM + oz]]) if (n > 1e-6) best = Math.min(best, d / n);
  for (const o of OBSTACLES) {
    if (o.r) {
      const fx = ox - o.x, fz = oz - o.z;
      const b = fx * dx + fz * dz, c = fx * fx + fz * fz - o.r * o.r;
      const disc = b * b - c;
      if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t > 0) best = Math.min(best, t); }
    } else {
      const t1x = (o.x - o.w / 2 - ox) / dx, t2x = (o.x + o.w / 2 - ox) / dx;
      const t1z = (o.z - o.d / 2 - oz) / dz, t2z = (o.z + o.d / 2 - oz) / dz;
      const tmin = Math.max(Math.min(t1x, t2x), Math.min(t1z, t2z));
      const tmax = Math.min(Math.max(t1x, t2x), Math.max(t1z, t2z));
      if (tmax >= Math.max(tmin, 0) && tmin > 0) best = Math.min(best, tmin);
    }
  }
  return best;
}

export function mountXplorerTwin(container, { build, reducedMotion = false } = {}) {
  const stage = createStage(container, { fov: 30, dpr: 1.5 });
  const { scene, camera } = stage;

  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x0a0a0b, 1.1));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
  key.position.set(2, 3, 1.5);
  const rim = new THREE.DirectionalLight(0xfa520f, 2.2);
  rim.position.set(-2.5, 1.2, -2);
  scene.add(key, rim);

  const world = new THREE.Group();
  scene.add(world);

  // Ground: polar grid and a soft contact shadow.
  const grid = new THREE.PolarGridHelper(ROOM * 1.15, 16, 8, 64, 0x3a3836, 0x262524);
  grid.material.transparent = true;
  grid.material.opacity = 0.6;
  world.add(grid);
  const shadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    rg.addColorStop(0, 'rgba(0,0,0,0.75)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  world.add(shadow);

  // Robot.
  let params = blendTwin(build.twin, build.twin, 0);
  const robot = createXplorerModel(build.twin);
  world.add(robot.group);

  // Obstacles as faint wireframes: they only matter in sensor view.
  const obstacleMat = new THREE.LineBasicMaterial({ color: 0xf3eee4, transparent: true, opacity: 0 });
  const obstacles = new THREE.Group();
  for (const o of OBSTACLES) {
    const geo = o.r ? new THREE.CylinderGeometry(o.r, o.r, o.h, 14, 1) : new THREE.BoxGeometry(o.w, o.h, o.d);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), obstacleMat);
    edges.position.set(o.x, o.h / 2, o.z);
    obstacles.add(edges);
  }
  const wallGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(ROOM * 2, 0.6, ROOM * 2));
  const walls = new THREE.LineSegments(wallGeo, obstacleMat);
  walls.position.y = 0.3;
  obstacles.add(walls);
  world.add(obstacles);

  // LiDAR returns (points) and the beams inside the camera field of view (fan).
  const hitPos = new Float32Array(RAYS * 3);
  const hitCol = new Float32Array(RAYS * 3);
  const hitDist = new Float32Array(RAYS);
  const ptsGeo = new THREE.BufferGeometry();
  ptsGeo.setAttribute('position', new THREE.BufferAttribute(hitPos, 3));
  ptsGeo.setAttribute('color', new THREE.BufferAttribute(hitCol, 3));
  const ptsMat = new THREE.PointsMaterial({ size: 0.04, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(ptsGeo, ptsMat);
  world.add(points);

  const beamPos = new Float32Array(RAYS * 6);
  const beamCol = new Float32Array(RAYS * 6);
  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute('position', new THREE.BufferAttribute(beamPos, 3));
  beamGeo.setAttribute('color', new THREE.BufferAttribute(beamCol, 3));
  const beamMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const beams = new THREE.LineSegments(beamGeo, beamMat);
  world.add(beams);

  const fovSegs = 40;
  const fovPos = new Float32Array((fovSegs + 2) * 3);
  const fovGeo = new THREE.BufferGeometry();
  fovGeo.setAttribute('position', new THREE.BufferAttribute(fovPos, 3));
  const fovIdx = [];
  for (let i = 1; i <= fovSegs; i++) fovIdx.push(0, i, i + 1);
  fovGeo.setIndex(fovIdx);
  const fovMat = new THREE.MeshBasicMaterial({ color: 0xfa520f, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const fov = new THREE.Mesh(fovGeo, fovMat);
  world.add(fov);

  const lidarWorld = new THREE.Vector3();
  const camWorld = new THREE.Vector3();
  const near = new THREE.Color(0xffb547), far = new THREE.Color(0xc1121f), tmp = new THREE.Color();

  /** Recasts every ray from the current LiDAR position (cheap: analytic intersections). */
  function scan() {
    robot.group.updateMatrixWorld(true);
    world.updateMatrixWorld(true);
    robot.lidar.getWorldPosition(lidarWorld);
    world.worldToLocal(lidarWorld);
    robot.camera.getWorldPosition(camWorld);
    world.worldToLocal(camWorld);
    const y = lidarWorld.y;
    for (let i = 0; i < RAYS; i++) {
      const a = (i / RAYS) * Math.PI * 2;
      const d = castRay(lidarWorld.x, lidarWorld.z, a);
      hitDist[i] = d;
      const x = lidarWorld.x + Math.cos(a) * d, z = lidarWorld.z - Math.sin(a) * d;
      hitPos.set([x, y, z], i * 3);
      beamPos.set([lidarWorld.x, y, lidarWorld.z, x, y, z], i * 6);
    }
    // Camera fan: the floor area inside the 49.8° FOV up to the first LiDAR return.
    fovPos.set([camWorld.x, 0.004, camWorld.z], 0);
    for (let i = 0; i <= fovSegs; i++) {
      const a = -HALF_FOV + (i / fovSegs) * HALF_FOV * 2;
      const d = Math.min(castRay(camWorld.x, camWorld.z, a), 3);
      fovPos.set([camWorld.x + Math.cos(a) * d, 0.004, camWorld.z - Math.sin(a) * d], (i + 1) * 3);
    }
    ptsGeo.attributes.position.needsUpdate = true;
    beamGeo.attributes.position.needsUpdate = true;
    fovGeo.attributes.position.needsUpdate = true;
    fovGeo.computeBoundingSphere();
    ptsGeo.computeBoundingSphere();
    beamGeo.computeBoundingSphere();
  }

  const sensors = { lidar: 0, camera: 0 };
  let sweep = 0;

  /** Colours points by range and age since the sweep passed; beams glow near the sweep and in the FOV. */
  function shade() {
    const span = Math.PI * 2;
    for (let i = 0; i < RAYS; i++) {
      const a = (i / RAYS) * span;
      const age = reducedMotion ? 0.3 : (((sweep - a) % span) + span) % span / span;
      const k = 0.22 + 0.78 * Math.pow(1 - age, 3);
      tmp.copy(near).lerp(far, Math.min(hitDist[i] / 2.6, 1)).multiplyScalar(k);
      hitCol.set([tmp.r, tmp.g, tmp.b], i * 3);
      const inFov = a < HALF_FOV || a > span - HALF_FOV;
      const head = age < 0.02 ? (1 - age / 0.02) * 0.9 * sensors.lidar : 0;
      const fovGlow = inFov ? 0.55 * sensors.camera : 0;
      const b = Math.max(head, fovGlow);
      const [r, g, bl] = inFov ? [1, 0.42, 0.12] : [1, 0.75, 0.45];
      beamCol.set([b * r * 0.25, b * g * 0.25, b * bl * 0.25], i * 6);
      beamCol.set([b * r, b * g, b * bl], i * 6 + 3);
    }
    ptsGeo.attributes.color.needsUpdate = true;
    beamGeo.attributes.color.needsUpdate = true;
  }

  function frame() {
    const aspect = stage.size.w / stage.size.h;
    const dist = aspect < 1 ? 4.4 / Math.max(aspect, 0.6) : 4.4;
    camera.position.set(dist * 0.52, dist * 0.62, dist * 0.52);
    camera.lookAt(0, 0.05, 0);
  }

  let spin = 0.6, velocity = 0, travel = 0;
  stage.onFrame((t, dt) => {
    frame();
    if (!reducedMotion) {
      spin += dt * 0.22 + velocity;
      velocity *= 0.92;
      sweep = (t * Math.PI * 2 * 0.45) % (Math.PI * 2);
      travel += dt * 0.35;
      robot.roll(travel, params);
    }
    world.rotation.y = spin;
    shadow.scale.set(params.len * 2.2, 1, params.wid * 2.6);
    if (sensors.lidar > 0 || sensors.camera > 0) shade();
  });

  // Drag to turn the turntable (vertical page scroll still works on touch).
  let dragX = null;
  container.addEventListener('pointerdown', (e) => { dragX = e.clientX; });
  window.addEventListener('pointerup', () => (dragX = null));
  container.addEventListener('pointermove', (e) => {
    if (dragX === null) return;
    velocity = (e.clientX - dragX) * 0.0025;
    dragX = e.clientX;
    if (reducedMotion) { spin += velocity * 4; stage.renderOnce(); }
  });

  const redraw = () => { if (reducedMotion) { shade(); stage.renderOnce(); } };
  scan();
  shade();
  if (reducedMotion) {
    new ResizeObserver(() => stage.renderOnce()).observe(container);
    stage.renderOnce();
  } else stage.start();

  let morph = null;
  return {
    setBuild(next) {
      morph?.kill();
      const from = { ...params, body: '#' + params.body.getHexString(), top: '#' + params.top.getHexString(), pucks: params.pucks.filter((p) => p.s > 0.5).map((p) => p.p) };
      const o = { t: 0 };
      const step = () => { params = blendTwin(from, next.twin, o.t); robot.apply(params); scan(); };
      if (reducedMotion) { o.t = 1; step(); redraw(); return; }
      morph = gsap.to(o, { t: 1, duration: 1.2, ease: 'power3.inOut', onUpdate: step });
    },
    setSensors(next) {
      const to = { lidar: next.lidar ? 1 : 0, camera: next.camera ? 1 : 0 };
      const apply = () => {
        ptsMat.opacity = sensors.lidar;
        beamMat.opacity = Math.max(sensors.lidar, sensors.camera);
        fovMat.opacity = 0.16 * sensors.camera;
        obstacleMat.opacity = 0.3 * Math.max(sensors.lidar, sensors.camera);
        shade();
        redraw();
      };
      if (reducedMotion) { Object.assign(sensors, to); apply(); return; }
      gsap.to(sensors, { ...to, duration: 0.7, ease: 'power2.out', onUpdate: apply });
    },
    destroy() { stage.destroy(); },
  };
}
