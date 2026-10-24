// SAS · six translucent layer slabs (L0 bottom → L5 top) that assemble, explode and highlight one layer.
//
// Options: bare, compact, height, aspect, progress (0..1), layer (-1..5), labels ("full" | "compact" | "none").
// Returned API (also exposed as `el.sasStack`, announced with a "demo:ready" event):
//   setProgress(p)  0 = scattered (entry) · 0.5 = assembled stack · 1 = exploded view
//   setLayer(i)     highlight layer i (lifts, glows orange); -1 clears
//   setView({ x, y, scale, labels })  screen anchor of the stack in NDC (-1..1) and zoom, for scroll choreography
// Runtime flows are drawn as particles: context rises from sensing (cool), goals descend from L3 (orange),
// and violet motes trace the offline audit → digest memory cycle between L3 and L5.

import { createStage, THREE } from '../lib/stage.js';
import { LAYERS } from './reasoning/sas-data.js';
import { drawSlabArt } from './reasoning/slab-art.js';
import { buildFrame } from './reasoning/frame.js';

const SLAB = { w: 3.4, h: 0.14, d: 2.3 };
const GAP_ASSEMBLED = 0.07;
const GAP_EXPLODED = 0.6;
const ORANGE = new THREE.Color('#fa520f');

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

function softDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export default function mount(el, { options = {}, reducedMotion }) {
  const labelsMode = options.labels || (options.compact ? 'compact' : 'full');
  const { root, body } = buildFrame(el, {
    title: 'Semantic Autonomy Stack · L0–L5',
    label: 'Three-dimensional diagram of the six Semantic Autonomy Stack layers, from L0 Mobile Platform at the bottom to L5 Operational Memory at the top.',
    legend: '<span class="rz-chip rz-chip--cool">context ↑</span><span class="rz-chip rz-chip--fire">goals ↓</span><span class="rz-chip rz-chip--violet">memory cycle</span>',
    options,
    cls: 'sas3d',
  });
  body.classList.add('sas3d__body');
  if (options.height) body.style.height = typeof options.height === 'number' ? `${options.height}px` : options.height;
  else if (!options.bare) body.style.aspectRatio = String(options.aspect || 1.15);

  const viewport = document.createElement('div');
  viewport.className = 'sas3d__viewport';
  viewport.setAttribute('role', 'img');
  viewport.setAttribute('aria-label', 'Stack of six layers: ' + LAYERS.map((l) => `${l.id} ${l.name}`).join(', ') + '.');
  body.appendChild(viewport);

  const stage = createStage(viewport, { fov: 28, dpr: 1.5 });
  const { scene, camera } = stage;
  camera.position.set(0, 3.1, 11.5);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xfff1e0, 1.6);
  key.position.set(4, 8, 6);
  scene.add(key);
  const glowLight = new THREE.PointLight(ORANGE, 0, 6, 1.6);
  scene.add(glowLight);

  // Outer group carries the screen anchor; inner group carries rotation, so rotation stays about the stack axis.
  const anchor = new THREE.Group();
  const stack = new THREE.Group();
  anchor.add(stack);
  scene.add(anchor);

  const dot = softDotTexture();
  const slabGeo = new THREE.BoxGeometry(SLAB.w, SLAB.h, SLAB.d);
  const edgeGeo = new THREE.EdgesGeometry(slabGeo);
  const faceGeo = new THREE.PlaneGeometry(SLAB.w * 0.94, SLAB.d * 0.94);

  // Deterministic pseudo-random scatter so the entry animation looks the same every visit.
  const scatter = LAYERS.map((_, i) => ({ x: Math.sin(i * 12.9) * 2.2, y: (i - 2.5) * 1.4 + Math.cos(i * 7.1) * 0.6, r: Math.sin(i * 3.7) * 1.4 }));

  const slabs = LAYERS.map((layer, i) => {
    const color = new THREE.Color(layer.color);
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.16, roughness: 0.25, metalness: 0.2, depthWrite: false, emissive: color, emissiveIntensity: 0.08 });
    const mesh = new THREE.Mesh(slabGeo, bodyMat);
    const edgeMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    const artCanvas = drawSlabArt(i, layer.color);
    const tex = new THREE.CanvasTexture(artCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const faceMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.rotation.x = -Math.PI / 2;
    face.position.y = SLAB.h / 2 + 0.004;
    group.add(mesh, edges, face);
    stack.add(group);
    return { group, bodyMat, edgeMat, faceMat, tex, artCanvas, color, layer, lift: 0, glow: 0 };
  });

  // Redraw slab art once the mono font is available so the canvas text is crisp and on-brand.
  document.fonts?.ready.then(() => slabs.forEach((s, i) => { drawSlabArt(i, s.layer.color, s.artCanvas); s.tex.needsUpdate = true; }));

  // Orange halo under the active layer.
  const haloMat = new THREE.SpriteMaterial({ map: dot, color: ORANGE, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.set(6, 3.2, 1);
  stack.add(halo);

  // ---- Particles: context rising, goals descending, memory cycle ----
  const FLOW = reducedMotion ? 0 : 150;
  const flowPos = new Float32Array(FLOW * 3);
  const flowCol = new Float32Array(FLOW * 3);
  const flowState = [];
  const cool = new THREE.Color('#bfe9ff'), fire = new THREE.Color('#ff8a3d');
  for (let i = 0; i < FLOW; i++) {
    const down = i % 4 === 0; // a quarter of the motes are goals flowing back down to L1
    flowState.push({ x: (Math.random() - 0.5) * SLAB.w * 0.8, z: (Math.random() - 0.5) * SLAB.d * 0.8, t: Math.random(), speed: 0.08 + Math.random() * 0.12, down });
    (down ? fire : cool).toArray(flowCol, i * 3);
  }
  const flowGeo = new THREE.BufferGeometry();
  flowGeo.setAttribute('position', new THREE.BufferAttribute(flowPos, 3));
  flowGeo.setAttribute('color', new THREE.BufferAttribute(flowCol, 3));
  const flowMat = new THREE.PointsMaterial({ size: 0.09, map: dot, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flow = new THREE.Points(flowGeo, flowMat);
  stack.add(flow);

  const MEM = reducedMotion ? 0 : 26;
  const memPos = new Float32Array(MEM * 3);
  const memGeo = new THREE.BufferGeometry();
  memGeo.setAttribute('position', new THREE.BufferAttribute(memPos, 3));
  const memMat = new THREE.PointsMaterial({ size: 0.11, map: dot, color: '#b3a8ff', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const mem = new THREE.Points(memGeo, memMat);
  stack.add(mem);
  const memLineMat = new THREE.LineBasicMaterial({ color: '#9b8cff', transparent: true, opacity: 0.35, depthWrite: false });
  const memLine = new THREE.Line(new THREE.BufferGeometry(), memLineMat);
  stack.add(memLine);

  // ---- HTML labels projected from 3D (crisper than WebGL text) ----
  const labelLayer = document.createElement('div');
  labelLayer.className = `sas3d__labels sas3d__labels--${labelsMode}`;
  labelLayer.setAttribute('aria-hidden', 'true');
  const labels = LAYERS.map((l) => {
    const d = document.createElement('div');
    d.className = 'sas3d-label';
    d.style.setProperty('--c', l.color);
    d.innerHTML = `<i></i><b>${l.id}</b><span class="sas3d-label__name">${l.name}</span><span class="sas3d-label__tag">${l.tag}</span>`;
    labelLayer.appendChild(d);
    return d;
  });
  if (labelsMode !== 'none') viewport.appendChild(labelLayer);

  // ---- State, eased every frame toward targets ----
  const target = { p: options.progress ?? 0.5, layer: options.layer ?? -1, x: 0, y: 0, scale: 1 };
  const cur = { p: reducedMotion ? target.p : 0, x: 0, y: 0, scale: 1 };
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let idleRot = 0;

  const gapFor = (p) => GAP_ASSEMBLED + (GAP_EXPLODED - GAP_ASSEMBLED) * smooth(clamp01((p - 0.5) / 0.5));
  const slabY = (i, gap) => (i - 2.5) * (SLAB.h + gap);

  // Memory cycle curve on the right side of the stack, from L3 up to L5 and back.
  function memCurve(gap) {
    const y3 = slabY(3, gap), y5 = slabY(5, gap);
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(SLAB.w / 2 + 0.05, y3, 0.3),
      new THREE.Vector3(SLAB.w / 2 + 0.55, (y3 + y5) / 2, 0.5),
      new THREE.Vector3(SLAB.w / 2 + 0.05, y5, 0.3),
      new THREE.Vector3(SLAB.w / 2 + 0.35, (y3 + y5) / 2, -0.4),
    ], true);
  }

  const v = new THREE.Vector3();
  function layout(t, dt) {
    const k = reducedMotion ? 1 : 1 - Math.pow(0.0025, dt || 0.016);
    cur.p += (target.p - cur.p) * k;
    cur.x += (target.x - cur.x) * k;
    cur.y += (target.y - cur.y) * k;
    cur.scale += (target.scale - cur.scale) * k;

    const enter = smooth(clamp01(cur.p / 0.5));
    const gap = gapFor(cur.p);
    const active = target.layer;

    slabs.forEach((s, i) => {
      const isActive = i === active;
      s.lift += ((isActive ? 0.22 : 0) - s.lift) * k;
      s.glow += ((isActive ? 1 : 0) - s.glow) * k;
      const sc = scatter[i];
      s.group.position.set(sc.x * (1 - enter), slabY(i, gap) + (sc.y - slabY(i, gap)) * (1 - enter) + s.lift, 0);
      s.group.rotation.y = sc.r * (1 - enter);
      s.group.rotation.z = sc.r * 0.25 * (1 - enter);
      const dim = active >= 0 && !isActive ? 0.55 : 1;
      s.bodyMat.opacity = (0.12 + 0.16 * s.glow) * enter;
      s.bodyMat.emissiveIntensity = 0.08 + 0.5 * s.glow;
      s.edgeMat.color.copy(s.color).lerp(ORANGE, s.glow * 0.85);
      s.edgeMat.opacity = (0.5 + 0.5 * s.glow) * enter * dim;
      s.faceMat.opacity = (0.5 + 0.45 * s.glow) * enter * dim;
      s.group.scale.setScalar(1 + 0.035 * s.glow);
    });

    if (active >= 0) {
      halo.position.set(0, slabs[active].group.position.y - 0.05, 0);
      glowLight.position.set(0, slabs[active].group.position.y + 0.6, 1.2);
    }
    haloMat.opacity += ((active >= 0 ? 0.55 : 0) * enter - haloMat.opacity) * k;
    glowLight.intensity = haloMat.opacity * 6;

    // Particles travel through the full stack height.
    const bottom = slabY(0, gap), top = slabY(5, gap), l3 = slabY(3, gap), l1 = slabY(1, gap);
    for (let i = 0; i < FLOW; i++) {
      const f = flowState[i];
      if (!reducedMotion) f.t = (f.t + f.speed * (dt || 0)) % 1;
      const y = f.down ? l3 - f.t * (l3 - l1) : bottom + f.t * (top - bottom);
      flowPos[i * 3] = f.x * enter; flowPos[i * 3 + 1] = y; flowPos[i * 3 + 2] = f.z * enter;
    }
    flowGeo.attributes.position.needsUpdate = true;
    flowMat.opacity = 0.85 * enter;

    const curve = memCurve(gap);
    memLine.geometry.setFromPoints(curve.getPoints(48));
    memLineMat.opacity = 0.35 * enter;
    for (let i = 0; i < MEM; i++) {
      curve.getPointAt(((i / MEM) + t * 0.06) % 1, v);
      memPos[i * 3] = v.x; memPos[i * 3 + 1] = v.y; memPos[i * 3 + 2] = v.z;
    }
    memGeo.attributes.position.needsUpdate = true;
    memMat.opacity = 0.9 * enter;

    // Rotation: gentle idle sway plus pointer parallax.
    if (!reducedMotion) idleRot += (dt || 0) * 0.12;
    pointer.x += (pointer.tx - pointer.x) * k * 0.6;
    pointer.y += (pointer.ty - pointer.y) * k * 0.6;
    stack.rotation.y = -0.62 + Math.sin(idleRot) * 0.22 + pointer.x * 0.25;
    stack.rotation.x = pointer.y * 0.08;

    // Screen anchor: place the stack at NDC (x, y) at its distance from the camera.
    const dist = camera.position.length();
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
    anchor.position.set(cur.x * halfH * camera.aspect, cur.y * halfH, 0);
    const fit = Math.min(1, camera.aspect / 0.9); // shrink on tall, narrow viewports
    anchor.scale.setScalar(cur.scale * fit * (0.86 + 0.14 * enter));

    placeLabels(gap, enter);
  }

  const corner = new THREE.Vector3();
  const corner2 = new THREE.Vector3();
  function placeLabels(gap, enter) {
    if (labelsMode === 'none') return;
    const w = stage.size.w, hgt = stage.size.h;
    stack.updateMatrixWorld(true);
    slabs.forEach((s, i) => {
      // Anchor each label on whichever right-hand corner of the slab is furthest right on screen,
      // so labels sit beside the stack (not on it) as it rotates.
      corner.set(SLAB.w / 2, 0, SLAB.d / 2).applyMatrix4(s.group.matrixWorld).project(camera);
      corner2.set(SLAB.w / 2, 0, -SLAB.d / 2).applyMatrix4(s.group.matrixWorld).project(camera);
      if (corner2.x > corner.x) corner.copy(corner2);
      const x = Math.min(w - 40, (corner.x * 0.5 + 0.5) * w + 14);
      const y = (-corner.y * 0.5 + 0.5) * hgt;
      const lbl = labels[i];
      lbl.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translateY(-50%)`;
      lbl.style.opacity = String(enter * (target.layer < 0 || target.layer === i ? 1 : 0.5));
      lbl.classList.toggle('is-active', target.layer === i);
    });
  }

  stage.onFrame(layout);

  const onPointer = (e) => {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  };
  if (!reducedMotion) window.addEventListener('pointermove', onPointer, { passive: true });

  // Standalone (framed) use: layer buttons + slow auto-cycle until the visitor picks one.
  let cycle = 0, cycleTimer = 0, userPicked = false;
  if (!options.bare) {
    const bar = document.createElement('div');
    bar.className = 'sas3d__controls';
    bar.innerHTML = LAYERS.map((l, i) => `<button type="button" class="rz-btn" data-i="${i}" aria-pressed="false" style="--c:${l.color}">${l.id}</button>`).join('');
    body.appendChild(bar);
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      userPicked = true;
      api.setLayer(Number(b.dataset.i));
    });
    if (!reducedMotion && target.layer < 0 && !options.compact) {
      cycleTimer = setInterval(() => { if (!userPicked && running) api.setLayer(cycle++ % 6); }, 2600);
    }
  }
  const syncButtons = () => root.querySelectorAll('.sas3d__controls button').forEach((b, i) => b.setAttribute('aria-pressed', String(i === target.layer)));

  let running = false;
  const redraw = () => { if (reducedMotion || !running) stage.renderOnce(); };

  const api = {
    play() { running = true; if (reducedMotion) stage.renderOnce(); else stage.start(); },
    pause() { running = false; stage.stop(); },
    destroy() {
      clearInterval(cycleTimer);
      window.removeEventListener('pointermove', onPointer);
      stage.destroy();
      [slabGeo, edgeGeo, faceGeo, flowGeo, memGeo, memLine.geometry].forEach((g) => g.dispose());
      slabs.forEach((s) => { s.tex.dispose(); s.bodyMat.dispose(); s.edgeMat.dispose(); s.faceMat.dispose(); });
      dot.dispose();
    },
    setProgress(p) { target.p = clamp01(p); if (reducedMotion) cur.p = target.p; redraw(); },
    setLayer(i) { target.layer = i; syncButtons(); redraw(); },
    setView({ x = target.x, y = target.y, scale = target.scale } = {}) {
      Object.assign(target, { x, y, scale });
      if (reducedMotion) Object.assign(cur, { x, y, scale });
      redraw();
    },
  };

  if (reducedMotion) stage.renderOnce();
  el.sasStack = api;
  el.dispatchEvent(new CustomEvent('demo:ready', { detail: api }));
  return api;
}
