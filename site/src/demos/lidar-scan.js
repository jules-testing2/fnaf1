// lidar-scan: a rotating multi-channel LiDAR sweep reveals an indoor room point by point (illustrative scene).
// Points live in a preallocated ring buffer (no per-frame allocations), fade with age in the shader and are
// drawn as additive glowing sprites; colour encodes range (amber near → orange → red far), cyan marks people.
//
// Options: bare, compact, theme, height, aspect, ambient (slow orbiting camera, no UI, transparent background).
// Returned API: play(), pause(), destroy().

import { createStage, THREE } from '../lib/stage.js';
import { createShell, legendItem, el } from './navigation/shell.js';
import { cast, PATROL } from './navigation/lidar-world.js';

const CHANNELS = 16, ELEV_MIN = -15, ELEV_MAX = 15;      // vertical fan (degrees)
const AZ_STEPS = 720, REV_SECONDS = 1.6, CAPACITY = 140000;
const SENSOR_H = 0.45, SPEED = 0.45;

const VERT = /* glsl */`
  attribute vec3 color; attribute float birth;
  uniform float uTime, uSize, uFade, uFloor, uGain;
  varying vec3 vColor; varying float vAlpha;
  void main() {
    if (birth < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float age = max(uTime - birth, 0.0);
    float fresh = exp(-age * 3.0);
    vAlpha = max(uFloor, exp(-age / uFade)) * uGain;
    vColor = color * (1.0 + fresh * 1.6);
    gl_PointSize = uSize * (1.0 + fresh) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */`
  varying vec3 vColor; varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float a = (smoothstep(0.5, 0.0, r) * 0.35 + exp(-r * r * 22.0) * 0.65) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * a, a);
  }`;

const AMBER = [1.0, 0.71, 0.28], ORANGE = [0.98, 0.32, 0.06], RED = [0.76, 0.07, 0.12], CYAN = [0.36, 0.75, 0.92];

export default function mount(host, { options = {}, reducedMotion = false } = {}) {
  const ambient = !!options.ambient;
  const shell = createShell(host, {
    title: options.title || 'LiDAR sweep · point cloud',
    label: 'Three-dimensional point cloud of an indoor room and corridor revealed by a rotating LiDAR sweep from a moving robot. Points are coloured by range, people in cyan. Illustrative scene.',
    options: ambient ? { ...options, bare: true } : options,
    aspect: (w) => (w < 600 ? 1 : 16 / 9),
    live: !ambient,
  });
  if (ambient) shell.root.classList.add('navd--ambient');
  else shell.stage.style.background = '#0a0a0b';
  if (shell.legend) {
    shell.legend.append(legendItem('linear-gradient(90deg,#ffb547,#fa520f,#c1121f)', 'near → far', 'grad'), legendItem('#5bc0eb', 'person'));
  }
  const hud = el('div', 'ls__hud', '<span>Illustrative scene</span><span>points <b>0</b></span>');
  if (!ambient) shell.stage.append(hud);
  const countEl = hud.querySelector('b');

  const stage = createStage(shell.stage, { fov: 40 });
  const { scene, camera } = stage;

  // ---------- Point buffer ----------
  const pos = new Float32Array(CAPACITY * 3), col = new Float32Array(CAPACITY * 3), birth = new Float32Array(CAPACITY).fill(-1);
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage);
  const aBirth = new THREE.BufferAttribute(birth, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos); geo.setAttribute('color', aCol); geo.setAttribute('birth', aBirth);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(4, 1, 0), 30);
  const uniforms = { uTime: { value: 0 }, uSize: { value: 70 * Math.min(window.devicePixelRatio, 1.75) }, uFade: { value: 9 }, uFloor: { value: 0.16 }, uGain: { value: ambient ? 0.75 : 1 } };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  scene.add(new THREE.Points(geo, mat));
  let head = 0, count = 0;

  // ---------- Robot, beam, floor grid ----------
  const robot = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.4), new THREE.MeshBasicMaterial({ color: 0x1b1b1e }));
  body.position.y = 0.2;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: 0xfa520f }));
  edges.position.y = 0.2;
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 16), new THREE.MeshBasicMaterial({ color: 0xffb547 }));
  puck.position.y = SENSOR_H - 0.05;
  robot.add(body, edges, puck);
  scene.add(robot);
  const beamPos = new Float32Array(CHANNELS * 6);
  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute('position', new THREE.BufferAttribute(beamPos, 3).setUsage(THREE.DynamicDrawUsage));
  const beam = new THREE.LineSegments(beamGeo, new THREE.LineBasicMaterial({ color: 0xfa520f, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.frustumCulled = false;
  scene.add(beam);
  const grid = new THREE.GridHelper(36, 72, 0x5bc0eb, 0x5bc0eb);
  grid.material.transparent = true; grid.material.opacity = ambient ? 0.05 : 0.07; grid.position.set(4, 0, 0);
  scene.add(grid);

  // ---------- Patrol path ----------
  const curve = new THREE.CatmullRomCurve3(PATROL.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const pathLen = curve.getLength();
  const tmp = new THREE.Vector3(), tan = new THREE.Vector3();
  const hit = { t: 0, tag: 0 };
  const elev = Array.from({ length: CHANNELS }, (_, i) => THREE.MathUtils.degToRad(ELEV_MIN + (i * (ELEV_MAX - ELEV_MIN)) / (CHANNELS - 1)));
  const cosE = elev.map(Math.cos), sinE = elev.map(Math.sin);
  let az = 0, azAcc = 0, dist = 0, time = 0;

  function placeRobot(d) {
    const u = ((d / pathLen) % 1 + 1) % 1;
    curve.getPointAt(u, tmp); curve.getTangentAt(u, tan);
    robot.position.copy(tmp);
    robot.rotation.y = Math.atan2(-tan.z, tan.x);
  }

  /** Casts one vertical column at azimuth `a` and writes its returns into the ring buffer. */
  function column(a, stamp, drawBeam) {
    const ox = robot.position.x, oy = SENSOR_H, oz = robot.position.z;
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let c = 0; c < CHANNELS; c++) {
      const dx = ca * cosE[c], dy = sinE[c], dz = sa * cosE[c];
      const ok = cast(ox, oy, oz, dx, dy, dz, hit);
      const len = ok ? hit.t : 2.5;
      if (drawBeam) { const o = c * 6; beamPos[o] = ox; beamPos[o + 1] = oy; beamPos[o + 2] = oz; beamPos[o + 3] = ox + dx * len; beamPos[o + 4] = oy + dy * len; beamPos[o + 5] = oz + dz * len; }
      if (!ok) continue;
      const i = head, p = i * 3;
      pos[p] = ox + dx * hit.t; pos[p + 1] = oy + dy * hit.t; pos[p + 2] = oz + dz * hit.t;
      let rgb;
      if (hit.tag === 1) rgb = CYAN;
      else {
        const k = Math.min(1, Math.max(0, (hit.t - 0.5) / 9));
        const [A, B, u] = k < 0.5 ? [AMBER, ORANGE, k * 2] : [ORANGE, RED, (k - 0.5) * 2];
        const dim = hit.tag === 2 ? 0.55 : 1;
        col[p] = (A[0] + (B[0] - A[0]) * u) * dim; col[p + 1] = (A[1] + (B[1] - A[1]) * u) * dim; col[p + 2] = (A[2] + (B[2] - A[2]) * u) * dim;
        rgb = null;
      }
      if (rgb) { col[p] = rgb[0]; col[p + 1] = rgb[1]; col[p + 2] = rgb[2]; }
      birth[i] = stamp;
      head = (head + 1) % CAPACITY;
      count = Math.min(CAPACITY, count + 1);
    }
  }

  function markDirty(from, n) {
    for (const attr of [aPos, aCol, aBirth]) {
      attr.clearUpdateRanges();
      const s = attr.itemSize;
      if (from + n <= CAPACITY) attr.addUpdateRange(from * s, n * s);
      else { attr.addUpdateRange(from * s, (CAPACITY - from) * s); attr.addUpdateRange(0, (from + n - CAPACITY) * s); }
      attr.needsUpdate = true;
    }
    geo.setDrawRange(0, count);
  }

  function camAt(t) {
    const r = ambient ? 17 : 15, a = 0.6 + t * (ambient ? 0.025 : 0.05);
    camera.position.set(3 + Math.cos(a) * r, ambient ? 10 : 9, Math.sin(a) * r);
    camera.lookAt(3, 0, 0);
  }

  const azStep = (Math.PI * 2) / AZ_STEPS;
  stage.onFrame((t, dt) => {
    if (reducedMotion) return;
    time += dt; dist += SPEED * dt; placeRobot(dist);
    uniforms.uTime.value = time;
    azAcc += (Math.PI * 2 / REV_SECONDS) * dt;
    const start = head; let n = 0;
    while (azAcc >= azStep) {
      azAcc -= azStep; az += azStep;
      const before = count; column(az, time, azAcc < azStep); n += CHANNELS;
      void before;
    }
    if (n) markDirty(start, Math.min(n, CAPACITY));
    beamGeo.attributes.position.needsUpdate = true;
    camAt(time);
    if (countEl) countEl.textContent = count.toLocaleString('en-US');
  });

  if (reducedMotion) {
    // One complete static frame: full revolutions from several points along the patrol.
    for (let s = 0; s < 8; s++) { placeRobot((s / 8) * pathLen); for (let i = 0; i < AZ_STEPS; i++) column(i * azStep, 0, false); }
    placeRobot(0.1 * pathLen);
    uniforms.uTime.value = 1;
    markDirty(0, count);
    beam.visible = false;
    camAt(0);
    if (countEl) countEl.textContent = count.toLocaleString('en-US');
    stage.renderOnce();
    const ro = new ResizeObserver(() => stage.renderOnce());
    ro.observe(shell.stage);
    stage._ro = ro;
  } else { placeRobot(0); camAt(0); }

  return {
    play() { if (!reducedMotion) stage.start(); },
    pause() { stage.stop(); },
    destroy() {
      stage._ro?.disconnect(); stage.destroy();
      geo.dispose(); mat.dispose(); beamGeo.dispose(); body.geometry.dispose(); puck.geometry.dispose();
      shell.destroy();
    },
  };
}
