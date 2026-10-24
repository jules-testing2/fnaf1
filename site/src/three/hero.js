// Home hero: a robot's-eye world. A small AMR drives a loop through a room that exists only as a
// LiDAR point cloud. A rotating sweep lights the points up, detected objects get class-coloured
// boxes and HTML tags, the active route glows ahead of the robot, and a walking person puts a
// penalty on the graph edge the route avoids. setProgress(p) blends the camera from an orbiting
// perspective view (p = 0) to a top-down semantic map (p = 1); the page drives it from scroll.

import { createStage, THREE } from '../lib/stage.js';

const TAU = Math.PI * 2;
const ROOM = { w: 20, d: 14, h: 2.6 };
const BEAM = 0.13; // vertical spacing of the stylised LiDAR rings
const SWEEP_SPEED = 2.6; // rad/s

// Semantic objects (positions in metres, room centred on the origin, x right, z toward the viewer).
const OBJECTS = [
  { cls: 'person', conf: 0.91, tag: 'dynamic', color: '#ff4d5e', pos: [5.2, 3.6], size: [0.5, 1.75, 0.45], shape: 'person' },
  { cls: 'dining table', conf: 0.88, tag: 'static', color: '#7ce0c3', pos: [1.5, -0.5], size: [2.2, 0.75, 1.1], shape: 'table' },
  { cls: 'chair', conf: 0.86, tag: 'static', color: '#5bc0eb', pos: [-0.05, -0.5], size: [0.5, 0.95, 0.5], shape: 'chair' },
  { cls: 'chair', conf: 0.83, tag: 'static', color: '#5bc0eb', pos: [3.05, -0.5], size: [0.5, 0.95, 0.5], shape: 'chair' },
  { cls: 'couch', conf: 0.79, tag: 'static', color: '#9b8cff', pos: [-6.5, 5.9], size: [2.4, 0.85, 0.9], shape: 'couch' },
  { cls: 'potted plant', conf: 0.81, tag: 'minor', color: '#7ce0c3', pos: [-8.9, -6.0], size: [0.7, 1.3, 0.7], shape: 'plant' },
  { cls: 'door', conf: 0.76, tag: 'static', color: '#9b8cff', pos: [-9.9, 0], size: [0.12, 2.1, 1.6], shape: 'door' },
];
const PERSON = 0;

// Nav2 Route Server style graph. The robot loops 0-1-3-5-7-8-9-10-6-4-12; edge 9-11 is where
// the person walks, so it carries a semantic penalty and the route goes around it.
const NODES = [
  [-7.5, 3.0], [-7.5, -1.5], [-6.0, -5.0], [-1.5, -3.5], [-1.5, 2.5], [1.5, -3.2], [1.5, 2.2],
  [5.0, -3.5], [8.0, -2.5], [8.0, 2.5], [5.0, 0.8], [3.5, 5.0], [-4.0, 5.0],
];
const EDGES = [[0, 1], [1, 2], [1, 3], [0, 12], [12, 4], [4, 3], [3, 5], [4, 6], [5, 7], [7, 8], [8, 9], [9, 10], [10, 6], [10, 7], [6, 11], [11, 12], [9, 11]];
const PENALISED = [9, 11];
const LOOP = [0, 1, 3, 5, 7, 8, 9, 10, 6, 4, 12];

// Deterministic RNG so the room looks the same on every visit.
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds the point cloud: walls, partitions, floor grid and every object, snapped to LiDAR rings. */
function buildCloud(density) {
  const rand = rng(7);
  const pos = [], obj = [], kind = [];
  const ring = (y) => Math.round(y / BEAM) * BEAM + (rand() - 0.5) * 0.015;
  const push = (x, y, z, o = -1, k = 0) => { pos.push(x, y, z); obj.push(o); kind.push(k); };

  // A vertical wall segment from (x0,z0) to (x1,z1), with optional gaps along its length.
  const wall = (x0, z0, x1, z1, gaps = []) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (let y = BEAM; y < ROOM.h; y += BEAM) {
      const n = Math.round(len * 13 * density);
      for (let i = 0; i < n; i++) {
        const s = rand();
        const along = s * len;
        if (gaps.some(([a, b]) => along > a && along < b && y < 2.15)) continue;
        push(x0 + (x1 - x0) * s, ring(y), z0 + (z1 - z0) * s);
      }
    }
  };
  const { w, d } = ROOM;
  wall(-w / 2, -d / 2, w / 2, -d / 2);
  wall(w / 2, -d / 2, w / 2, d / 2);
  wall(w / 2, d / 2, -w / 2, d / 2);
  wall(-w / 2, d / 2, -w / 2, -d / 2, [[6.2, 7.8]]); // doorway on the left wall
  wall(-3.5, -d / 2, -3.5, -3.2); // office partition

  // Box surface sampler (no bottom face), rings applied to y.
  const box = (cx, cz, sx, sy, sz, o, y0 = 0, n = 300) => {
    const faces = [
      [sx * sz, (u, v) => [cx + (u - 0.5) * sx, y0 + sy, cz + (v - 0.5) * sz]],
      [sx * sy, (u, v) => [cx + (u - 0.5) * sx, y0 + v * sy, cz - sz / 2]],
      [sx * sy, (u, v) => [cx + (u - 0.5) * sx, y0 + v * sy, cz + sz / 2]],
      [sz * sy, (u, v) => [cx - sx / 2, y0 + v * sy, cz + (u - 0.5) * sz]],
      [sz * sy, (u, v) => [cx + sx / 2, y0 + v * sy, cz + (u - 0.5) * sz]],
    ];
    const total = faces.reduce((a, f) => a + f[0], 0);
    for (const [area, f] of faces) {
      const m = Math.round((n * density * area) / total);
      for (let i = 0; i < m; i++) { const [x, y, z] = f(rand(), rand()); push(x, i % 3 ? ring(y) : y, z, o, 1); }
    }
  };
  const cylinder = (cx, cz, r, y0, y1, o, n) => {
    for (let i = 0; i < n * density; i++) {
      const a = rand() * TAU;
      push(cx + Math.cos(a) * r, ring(y0 + rand() * (y1 - y0)), cz + Math.sin(a) * r, o, 1);
    }
  };
  const blob = (cx, cy, cz, r, o, n) => {
    for (let i = 0; i < n * density; i++) {
      const u = rand() * 2 - 1, a = rand() * TAU, k = Math.sqrt(1 - u * u), rr = r * (0.8 + rand() * 0.25);
      push(cx + Math.cos(a) * k * rr, cy + u * rr, cz + Math.sin(a) * k * rr, o, 1);
    }
  };

  OBJECTS.forEach((ob, i) => {
    const [x, z] = ob.pos;
    const [sx, sy, sz] = ob.size;
    switch (ob.shape) {
      case 'person': cylinder(x, z, 0.19, 0, 1.45, i, 520); blob(x, 1.6, z, 0.12, i, 120); break;
      case 'table':
        box(x, z, sx, 0.05, sz, i, 0.7, 520);
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => cylinder(x + a * (sx / 2 - 0.1), z + b * (sz / 2 - 0.1), 0.03, 0, 0.7, i, 40));
        break;
      case 'chair': box(x, z, sx, 0.06, sz, i, 0.42, 120); box(x + (x < 1.5 ? -0.22 : 0.22), z, 0.05, 0.5, sz, i, 0.45, 110); cylinder(x, z, 0.03, 0, 0.42, i, 40); break;
      case 'couch': box(x, z, sx, 0.45, sz, i, 0, 520); box(x, z + 0.32, sx, 0.4, 0.25, i, 0.45, 240); break;
      case 'plant': cylinder(x, z, 0.2, 0, 0.45, i, 160); blob(x, 0.95, z, 0.42, i, 520); break;
      case 'door': box(x, z, sx, sy, sz, i, 0, 260); break;
      default: box(x, z, sx, sy, sz, i, 0, 300);
    }
  });
  // Unlabelled structure: shelving along the back wall and a rack in the right bay.
  box(6.5, -6.6, 3.0, 1.9, 0.5, -1, 0, 900);
  box(8.6, 5.6, 1.6, 1.2, 1.2, -1, 0, 380);

  // Floor grid, rendered dimmer (kind 2).
  for (let x = -w / 2 + 0.25; x < w / 2; x += 0.5) for (let z = -d / 2 + 0.25; z < d / 2; z += 0.5) push(x, 0, z, -1, 2);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aObj', new THREE.Float32BufferAttribute(obj, 1));
  geo.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  return geo;
}

const POINT_VERT = /* glsl */ `
  attribute float aObj;
  attribute float aKind;
  uniform vec3 uRobot;
  uniform float uSweep, uReveal, uPx, uTop;
  uniform float uDet[7];
  uniform vec3 uCls[7];
  uniform vec2 uPersonOff;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    int oi = int(aObj + 0.5);
    if (aObj > -0.5 && oi == ${PERSON}) p.xz += uPersonOff;
    vec2 d = p.xz - uRobot.xz;
    float dist = length(d);
    float delta = mod(uSweep - atan(d.y, d.x), 6.2831853);
    float flare = exp(-delta * 2.4) * smoothstep(15.0, 1.5, dist);
    float mapped = smoothstep(uReveal, uReveal - 4.0, dist);

    // Height palette: ember at the floor, orange mid, amber up high.
    float h = clamp(p.y / 2.6, 0.0, 1.0);
    vec3 col = mix(vec3(0.76, 0.07, 0.12), vec3(0.98, 0.32, 0.06), smoothstep(0.0, 0.45, h));
    col = mix(col, vec3(1.0, 0.71, 0.28), smoothstep(0.45, 1.0, h));
    float det = 0.0;
    if (aObj > -0.5) { det = uDet[oi]; col = mix(col, uCls[oi], det * 0.85); }
    float base = aKind > 1.5 ? 0.16 + uTop * 0.14 : 0.5 + det * 0.35;
    vColor = mix(col, vec3(1.0, 0.93, 0.82), flare * 0.55);
    vAlpha = mapped * (base + flare * (aKind > 1.5 ? 0.5 : 0.85));

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = (aKind > 1.5 ? 1.4 : 2.4 + det * 0.8) * (1.0 + flare * 0.9);
    gl_PointSize = clamp(size * uPx * (15.0 / -mv.z), 1.0, 7.0);
    vAlpha *= smoothstep(52.0, 12.0, -mv.z);
    // Unmapped points cost fill-rate for nothing: push them outside the clip volume.
    if (vAlpha < 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }`;
const POINT_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = dot(c, c);
    if (r > 0.25) discard;
    gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.25, 0.02, r));
  }`;

// Floor overlay centred on the robot: sweep wedge, expanding scan ring and a soft core glow.
const SWEEP_VERT = /* glsl */ `
  uniform vec3 uRobot;
  varying vec2 vP;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vP = wp.xz - uRobot.xz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const SWEEP_FRAG = /* glsl */ `
  uniform float uSweep, uTime, uFade;
  varying vec2 vP;
  void main() {
    float d = length(vP);
    float delta = mod(uSweep - atan(vP.y, vP.x), 6.2831853);
    float wedge = exp(-delta * 3.2) * smoothstep(13.0, 0.8, d);
    float edge = smoothstep(0.04, 0.0, delta) * smoothstep(13.0, 0.5, d);
    float ring = exp(-abs(d - mod(uTime * 3.2, 15.0)) * 6.0) * smoothstep(15.0, 1.5, d);
    float core = smoothstep(1.8, 0.0, d);
    float a = (wedge * 0.22 + edge * 0.5 + ring * 0.16 + core * 0.35) * uFade;
    vec3 col = mix(vec3(0.98, 0.32, 0.06), vec3(1.0, 0.71, 0.28), edge + core * 0.5);
    gl_FragColor = vec4(col, a);
  }`;

// Route tube: the whole loop stays faint; a dashed, flowing look-ahead segment glows in front of the robot.
const ROUTE_VERT = /* glsl */ `
  varying float vU;
  void main() { vU = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ROUTE_FRAG = /* glsl */ `
  uniform float uHead, uLen, uTime, uBase, uGlow;
  varying float vU;
  void main() {
    float rel = fract(vU - uHead);
    float ahead = step(rel, uLen) * smoothstep(uLen, uLen * 0.55, rel);
    float dash = 0.55 + 0.45 * step(0.45, fract(rel * 90.0 - uTime * 1.6));
    vec3 col = mix(vec3(1.0, 0.71, 0.28), vec3(0.98, 0.32, 0.06), rel / max(uLen, 0.001));
    float a = uBase + ahead * dash * uGlow;
    gl_FragColor = vec4(col, a);
  }`;

const ease = (x) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);
const smooth = (x) => { x = Math.min(Math.max(x, 0), 1); return x * x * (3 - 2 * x); };

/**
 * @param {HTMLElement} container  sized element the canvas fills
 * @param {object} o
 * @param {HTMLElement} o.labels   overlay element for HTML object tags
 * @param {boolean} o.reducedMotion  render one complete static frame instead of animating
 * @param {(s:object)=>void} [o.onStats]  receives telemetry roughly 8 times a second
 */
export function mountHeroScene(container, { labels, reducedMotion = false, onStats } = {}) {
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const stage = createStage(container, { fov: 38, dpr: small ? 1.5 : 1.75 });
  const { scene, camera, renderer, size } = stage;
  renderer.setClearColor(0x000000, 0);

  // ---------- Point cloud ----------
  const cloud = buildCloud(small ? 0.5 : 0.8);
  const det = new Array(OBJECTS.length).fill(0);
  const pointMat = new THREE.ShaderMaterial({
    vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uRobot: { value: new THREE.Vector3() }, uSweep: { value: 0 }, uReveal: { value: 0 }, uTop: { value: 0 },
      uPx: { value: renderer.getPixelRatio() }, uDet: { value: det }, uPersonOff: { value: new THREE.Vector2() },
      uCls: { value: OBJECTS.map((o) => new THREE.Color(o.color)) },
    },
  });
  scene.add(new THREE.Points(cloud, pointMat));

  // ---------- Sweep floor overlay ----------
  const sweepMat = new THREE.ShaderMaterial({
    vertexShader: SWEEP_VERT, fragmentShader: SWEEP_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uRobot: { value: pointMat.uniforms.uRobot.value }, uSweep: { value: 0 }, uTime: { value: 0 }, uFade: { value: 1 } },
  });
  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(32, 32), sweepMat);
  sweep.rotation.x = -Math.PI / 2;
  sweep.position.y = 0.01;
  scene.add(sweep);

  // ---------- Route graph ----------
  const v3 = ([x, z], y = 0.03) => new THREE.Vector3(x, y, z);
  const edgePts = [];
  EDGES.forEach(([a, b]) => { if (!(a === PENALISED[0] && b === PENALISED[1])) edgePts.push(v3(NODES[a]), v3(NODES[b])); });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xf3eee4, transparent: true, opacity: 0.16, depthWrite: false });
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(edgePts), edgeMat));
  const penaltyMat = new THREE.LineBasicMaterial({ color: 0xff4d5e, transparent: true, opacity: 0.2, depthWrite: false });
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([v3(NODES[PENALISED[0]], 0.04), v3(NODES[PENALISED[1]], 0.04)]), penaltyMat));
  const nodeGeo = new THREE.RingGeometry(0.11, 0.17, 24).rotateX(-Math.PI / 2);
  const nodeMat = new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.55, depthWrite: false });
  NODES.forEach((n) => { const m = new THREE.Mesh(nodeGeo, nodeMat); m.position.copy(v3(n, 0.035)); scene.add(m); });

  // ---------- Active route (closed loop the robot drives) ----------
  const curve = new THREE.CatmullRomCurve3(LOOP.map((i) => v3(NODES[i], 0.06)), true, 'centripetal');
  const loopLen = curve.getLength();
  const routeMat = new THREE.ShaderMaterial({
    vertexShader: ROUTE_VERT, fragmentShader: ROUTE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uHead: { value: 0 }, uLen: { value: 0 }, uTime: { value: 0 }, uBase: { value: 0.08 }, uGlow: { value: 1 } },
  });
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 700, 0.035, 6, true), routeMat));
  const glowMat = routeMat.clone();
  glowMat.uniforms = THREE.UniformsUtils.clone(routeMat.uniforms);
  glowMat.uniforms.uBase.value = 0.015;
  glowMat.uniforms.uGlow.value = 0.18;
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 700, 0.12, 6, true), glowMat));

  // ---------- Semantic boxes + footprints ----------
  const boxes = OBJECTS.map((o) => {
    const [sx, sy, sz] = o.size;
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(sx + 0.16, sy + 0.1, sz + 0.16));
    const mat = new THREE.LineBasicMaterial({ color: o.color, transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.LineSegments(geo, mat);
    mesh.position.set(o.pos[0], (sy + 0.1) / 2, o.pos[1]);
    const foot = new THREE.Mesh(new THREE.PlaneGeometry(sx + 0.5, sz + 0.5).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    foot.position.set(o.pos[0], 0.02, o.pos[1]);
    scene.add(mesh, foot);
    return { mesh, mat, foot, t0: -1, home: mesh.position.clone() };
  });
  // Penalty halo around the person (inflation zone on the semantic map).
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.55, 1.25, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xff4d5e, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.y = 0.025;
  scene.add(halo);

  // ---------- Robot ----------
  const robot = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b1e, metalness: 0.4, roughness: 0.45 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xfa520f, emissive: 0xfa520f, emissiveIntensity: 0.6, roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.2, 0.5), dark);
  body.position.y = 0.2;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.36), accent);
  plate.position.y = 0.31;
  const lidar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.1, 24), new THREE.MeshStandardMaterial({ color: 0xffb547, emissive: 0xffb547, emissiveIntensity: 1.4 }));
  lidar.position.set(0.12, 0.37, 0);
  const wheelGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.08, 18).rotateX(Math.PI / 2);
  [[-0.24, -0.29], [0.24, -0.29], [-0.24, 0.29], [0.24, 0.29]].forEach(([x, z]) => {
    const w = new THREE.Mesh(wheelGeo, dark); w.position.set(x, 0.11, z); robot.add(w);
  });
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: 0xfa520f, transparent: true, opacity: 0.7 }));
  outline.position.copy(body.position);
  robot.add(body, plate, lidar, outline);
  robot.scale.setScalar(1.5);
  scene.add(robot);
  scene.add(new THREE.HemisphereLight(0xffe2c4, 0x1a0c08, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(4, 8, 6);
  scene.add(key);
  const glow = new THREE.PointLight(0xfa520f, 6, 4, 1.6);
  glow.position.y = 0.8;
  robot.add(glow);

  // ---------- HTML tags ----------
  const tags = OBJECTS.map((o) => {
    const el = document.createElement('div');
    el.className = 'hero-tag';
    el.style.setProperty('--c', o.color);
    el.innerHTML = `<b>${o.cls}</b><span>${o.conf.toFixed(2)}</span><i>${o.tag}</i>`;
    labels?.appendChild(el);
    return el;
  });
  const penaltyTag = document.createElement('div');
  penaltyTag.className = 'hero-tag hero-tag--penalty';
  penaltyTag.innerHTML = '<b>edge 9→11</b><span>penalty ↑</span><i>rerouted</i>';
  labels?.appendChild(penaltyTag);
  const penaltyMid = v3(NODES[PENALISED[0]]).add(v3(NODES[PENALISED[1]])).multiplyScalar(0.5);

  // ---------- State ----------
  const state = { progress: 0, px: 0, py: 0, tx: 0, ty: 0, target: new THREE.Vector3(), first: true };
  const tmp = new THREE.Vector3(), tan = new THREE.Vector3(), camPos = new THREE.Vector3(), up = new THREE.Vector3();
  const loopSeconds = loopLen / 0.75; // ~0.75 m/s
  const startU = 0.12;
  let lastStats = 0;

  function frame(t) {
    const p = smooth(state.progress);
    const portrait = size.w / size.h < 0.9;
    state.px += (state.tx - state.px) * 0.05;
    state.py += (state.ty - state.py) * 0.05;

    // Robot along the loop.
    const u = reducedMotion ? startU : (startU + t / loopSeconds) % 1;
    curve.getPointAt(u, tmp);
    curve.getTangentAt(u, tan);
    robot.position.set(tmp.x, 0, tmp.z);
    robot.rotation.y = Math.atan2(-tan.z, tan.x);
    lidar.rotation.y = t * 9;
    const rU = pointMat.uniforms.uRobot.value.copy(robot.position);
    sweep.position.set(rU.x, 0.01, rU.z);

    const sweepA = reducedMotion ? 2.2 : t * SWEEP_SPEED;
    const reveal = reducedMotion ? 99 : 1 + t * 6.5;
    pointMat.uniforms.uSweep.value = sweepA;
    pointMat.uniforms.uReveal.value = reveal;
    pointMat.uniforms.uTop.value = p;
    sweepMat.uniforms.uSweep.value = sweepA;
    sweepMat.uniforms.uTime.value = reducedMotion ? 1.2 : t;
    sweepMat.uniforms.uFade.value = 1 - p * 0.5;

    // Person paces across the penalised edge.
    const walk = reducedMotion ? 0.3 : Math.sin(t * 0.35) * 0.9;
    pointMat.uniforms.uPersonOff.value.set(0, walk);
    boxes[PERSON].mesh.position.z = boxes[PERSON].home.z + walk;
    boxes[PERSON].foot.position.z = boxes[PERSON].home.z + walk;
    halo.position.set(OBJECTS[PERSON].pos[0], 0.025, OBJECTS[PERSON].pos[1] + walk);

    // Detection: an object locks on the first time the sweep crosses it inside the mapped radius.
    let detected = 0;
    OBJECTS.forEach((o, i) => {
      const b = boxes[i];
      const ox = o.pos[0], oz = b.mesh.position.z;
      const dx = ox - rU.x, dz = oz - rU.z, dist = Math.hypot(dx, dz);
      const delta = ((sweepA - Math.atan2(dz, dx)) % TAU + TAU) % TAU;
      if (b.t0 < 0 && (reducedMotion || (dist < reveal - 1 && delta < 0.35))) b.t0 = reducedMotion ? -99 : t;
      if (b.t0 === -1) { det[i] = 0; return; }
      detected++;
      const s = reducedMotion ? 1 : ease((t - b.t0) / 0.6);
      const ping = Math.exp(-delta * 3) * 0.35;
      det[i] = s;
      b.mesh.scale.setScalar(1 + 0.45 * (1 - s));
      b.mat.opacity = s * (0.6 + ping) + (1 - s) * 0.9 * Math.min(1, (t - b.t0) * 6);
      b.foot.material.opacity = s * (0.05 + p * 0.22);
    });
    halo.material.opacity = det[PERSON] * (0.12 + 0.08 * Math.sin(t * 3) + p * 0.15);
    const penalty = det[PERSON];
    penaltyMat.opacity = 0.2 + penalty * (0.45 + 0.25 * Math.sin(t * 4));
    nodeMat.opacity = 0.35 + p * 0.4;
    edgeMat.opacity = 0.12 + p * 0.22;

    // Route look-ahead grows in, then rides in front of the robot.
    const look = reducedMotion ? 0.4 : 0.32 * ease((t - 0.6) / 2.2);
    for (const m of [routeMat, glowMat]) {
      m.uniforms.uHead.value = u;
      m.uniforms.uLen.value = look;
      m.uniforms.uTime.value = t;
    }
    routeMat.uniforms.uBase.value = 0.06 + p * 0.22;

    // Camera: slow orbit biased toward the robot, blended into a top-down map with scroll.
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const orbitTarget = tmp.set(rU.x * 0.25, 0.3, rU.z * 0.25);
    if (state.first) { state.target.copy(orbitTarget); state.first = false; }
    state.target.lerp(orbitTarget, 0.02);
    const az = 0.55 + (reducedMotion ? 0 : t * 0.02) + state.px * 0.18;
    const pol = 0.9 + state.py * 0.06;
    const r = portrait ? 24 : 17;
    const orbit = camPos.set(Math.sin(pol) * Math.sin(az), Math.cos(pol), Math.sin(pol) * Math.cos(az)).multiplyScalar(r).add(state.target);
    const topD = portrait ? Math.max(ROOM.w / (2 * tanHalf), ROOM.d / (2 * tanHalf * camera.aspect)) : Math.max(ROOM.d / (2 * tanHalf), ROOM.w / (2 * tanHalf * camera.aspect));
    const topPos = new THREE.Vector3(state.px * 0.6, topD * 1.04, state.py * 0.4);
    camera.position.copy(orbit).lerp(topPos, p);
    const look3 = state.target.clone().lerp(new THREE.Vector3(0, 0, 0), p);
    up.set(0, 1, 0).lerp(portrait ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, -1), p).normalize();
    camera.up.copy(up);
    camera.lookAt(look3);

    // Desktop: push the composition right so the headline has room on the left.
    const shift = size.w > 900 && !portrait ? 0.17 * (1 - p) : 0;
    camera.setViewOffset(size.w, size.h, -size.w * shift, 0, size.w, size.h);

    // HTML tags follow their boxes.
    const place = (el, pos, on) => {
      tmp.copy(pos).project(camera);
      const vis = on && tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
      el.classList.toggle('is-on', vis);
      if (vis) el.style.transform = `translate3d(${((tmp.x + 1) / 2) * size.w}px, ${((1 - tmp.y) / 2) * size.h}px, 0)`;
    };
    OBJECTS.forEach((o, i) => {
      const b = boxes[i];
      place(tags[i], new THREE.Vector3(o.pos[0], o.size[1] + 0.2, b.mesh.position.z), det[i] > 0.5);
    });
    place(penaltyTag, penaltyMid, penalty > 0.5);

    if (onStats && (t - lastStats > 0.12 || reducedMotion)) {
      lastStats = t;
      const n = cloud.attributes.position.count;
      onStats({
        points: Math.round(n * Math.min(1, reveal / 22)), objects: detected, total: OBJECTS.length,
        heading: Math.round(((sweepA % TAU) / TAU) * 360), x: rU.x, z: rU.z, route: loopLen * look,
      });
    }
  }
  stage.onFrame((t) => frame(t));

  const onPointer = (e) => { state.tx = (e.clientX / window.innerWidth) * 2 - 1; state.ty = (e.clientY / window.innerHeight) * 2 - 1; };
  if (!reducedMotion) window.addEventListener('pointermove', onPointer, { passive: true });

  if (reducedMotion) stage.renderOnce(); else stage.start();

  return {
    setProgress(p) { state.progress = p; if (reducedMotion) stage.renderOnce(); },
    destroy() {
      window.removeEventListener('pointermove', onPointer);
      stage.destroy();
      tags.concat(penaltyTag).forEach((el) => el.remove());
    },
  };
}
