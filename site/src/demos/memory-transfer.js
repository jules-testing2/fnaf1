// L5 · M3 promotion and shared-memory reuse across two robots (Session E block E4b, Figs. 3b and 6).
//
// Sequence: Xplorer-B baseline needs L3b → four induction cycles on Xplorer-C through L3b → audit records grouped
// by canonical key → promotion gate (f ≥ 3, c ≥ 0.80, ≥ 1 accepted L3b) over the three Session E candidates →
// one association compiled into the digest → deliberate installation on Xplorer-B → four Step-0 reuse cycles
// with no VLM call → a near-miss instruction returns to L3b.
// The paper is explicit that this is managed shared-memory reuse, not robot-to-robot learning, and that the
// gate measures sampled-output stability, not semantic correctness. The demo says so on screen.
// Options: bare, compact, theme. Returns { play, pause, destroy }.

import gsap from 'gsap';
import { buildFrame, h } from './reasoning/frame.js';
import { MEMORY, CANDIDATES, GATE } from './reasoning/sas-data.js';

const PHASES = ['Baseline', 'Induction', 'Promotion gate', 'Compile', 'Install', 'Reuse'];
const KEY = 'wet_gloves';
const DEST = 'radiator node';

export default function mount(el, { options = {}, reducedMotion }) {
  const { root, body } = buildFrame(el, {
    title: 'L5 · M3 promotion and shared-memory reuse',
    label: 'Animated diagram: an instruction resolved by the VLM four times on Xplorer-C passes the M3 promotion gate (frequency at least 3, consistency at least 0.80, at least one accepted L3b resolution), is compiled into a memory digest, deliberately installed on Xplorer-B, and then resolved there at Step 0 without a VLM call. Two other candidates with consistency 0.75 and 0.50 are rejected.',
    legend: '<span class="rz-chip rz-chip--violet">L3b · VLM</span><span class="rz-chip rz-chip--fire">Step 0 reuse</span>',
    options,
    cls: 'mt',
  });

  // ---- Phase rail ----
  const phaseEls = PHASES.map((p, i) => h('li.mono', h('b', String(i + 1)), p));
  const rail = h('ol.mt-phases', phaseEls);

  // ---- Robot columns ----
  const robot = (id, role, img) => {
    const log = h('ol.mt-log', { 'aria-live': 'off' });
    const badge = h('div.mt-badge.mono');
    const col = h('section.mt-robot',
      h('header.mt-robot__head', h('img', { src: img, alt: '', width: '120', height: '90', loading: 'lazy' }), h('div', h('b', id), h('span.mono', role))),
      badge, log);
    return { col, log, badge };
  };
  const C = robot('Xplorer-C', 'induction platform', 'img/xplorer-c.webp');
  const B = robot('Xplorer-B', 'recipient platform', 'img/xplorer-b.webp');

  // ---- Memory column ----
  const cards = {};
  const memCard = (m) => (cards[m.id] = h('div.mt-mem', { 'data-scope': m.scope }, h('b.mono', m.id), h('span', m.name), h('small', m.detail)));
  const m5count = h('em.mt-mem__count.mono', '0 records');
  const shared = h('div.mt-scope', h('span.mt-scope__label.mono', 'Shared across platforms'), ...MEMORY.filter((m) => m.scope === 'shared').map(memCard));
  const platform = h('div.mt-scope.mt-scope--platform', h('span.mt-scope__label.mono', 'Platform-aware'), ...MEMORY.filter((m) => m.scope === 'platform').map(memCard));
  cards.M5.append(m5count);
  const m3entry = h('div.mt-m3entry.mono', `${KEY} → ${DEST}`);
  cards.M3.append(m3entry);
  cards.M3.classList.add('mt-mem--m3');

  const candRows = CANDIDATES.map((c) => {
    const fill = h('i.mt-cand__fill');
    const verdict = h('span.mt-cand__verdict.mono', c.promoted ? 'promote' : 'reject');
    const f = h('span.mt-cand__f.mono', `f ${c.f} · ${c.split}`);
    const row = h('div.mt-cand', { 'data-ok': String(c.promoted) },
      h('span.mt-cand__key.mono', c.key), h('div.mt-cand__bar', fill, h('span.mt-cand__c.mono', c.c.toFixed(2))), f, verdict);
    return { row, fill, verdict, c };
  });
  const gate = h('div.mt-gate',
    h('div.mt-gate__head.mono', h('span', 'M3 promotion gate'), h('span', `f ≥ ${GATE.minFrequency} · c ≥ ${GATE.minConsistency.toFixed(2)} · ≥ 1 accepted L3b`)),
    h('div.mt-gate__rows', { style: `--th:${GATE.minConsistency}` }, ...candRows.map((r) => r.row)),
    h('p.mt-gate__note', 'Stability of the sampled destination, not semantic correctness.'));

  const digest = h('div.mt-digest.mono', h('b', 'compiled digest'), h('span', '1 association · 1 stored example'));
  const memory = h('section.mt-memory', h('header.mt-memory__head.mono', 'L5 · operational memory'), shared, platform, gate, digest);

  const packet = h('i.mt-packet', { 'aria-hidden': 'true' });
  const caveat = h('p.mt-caveat', 'Shared-memory reuse through deliberate digest installation, not robot-to-robot learning. The four reuse cycles verify one association.');
  body.append(rail, h('div.mt-grid', C.col, memory, B.col), caveat, packet);

  // ---- Helpers ----
  const setPhase = (i) => phaseEls.forEach((p, k) => { p.classList.toggle('is-on', k === i); p.classList.toggle('is-done', k < i); });

  const row = (log, cls, label, path, out) => {
    const r = h(`li.mt-row.${cls}`, h('span.mt-row__k.mono', label), h('span.mt-row__p.mono', path), h('span.mt-row__o.mono', out));
    log.append(r);
    while (log.children.length > 6) log.firstElementChild.remove();
    return r;
  };

  let records = 0;
  const bumpRecords = () => { records++; m5count.textContent = `${records} record${records === 1 ? '' : 's'}`; cards.M5.classList.add('is-ping'); setTimeout(() => cards.M5.classList.remove('is-ping'), 500); };

  // Fly a small packet between two elements (audit record or digest), in root coordinates.
  function fly(t, from, to, at, cls = '') {
    t.call(() => {
      const r = root.getBoundingClientRect();
      const a = from().getBoundingClientRect(), b = to().getBoundingClientRect();
      packet.className = `mt-packet ${cls}`;
      gsap.fromTo(packet,
        { x: a.left + a.width / 2 - r.left, y: a.top + a.height / 2 - r.top, autoAlpha: 1, scale: 0.6 },
        { x: b.left + b.width / 2 - r.left, y: b.top + b.height / 2 - r.top, scale: 1, duration: 0.6, ease: 'power2.inOut', onComplete: () => gsap.to(packet, { autoAlpha: 0, duration: 0.2 }) });
    }, null, at);
  }

  function reset() {
    C.log.innerHTML = ''; B.log.innerHTML = '';
    C.badge.textContent = 'digest: six-association state'; B.badge.textContent = 'digest: pre-promotion';
    B.badge.classList.remove('is-new');
    records = 0; m5count.textContent = '0 records';
    root.classList.remove('is-promoted', 'is-compiled', 'is-installed');
    candRows.forEach((r) => { r.row.classList.remove('is-judged'); gsap.set(r.fill, { scaleX: 0 }); });
    gsap.set(digest, { autoAlpha: 0, y: 10 });
    gsap.set(packet, { autoAlpha: 0 });
    setPhase(-1);
  }

  let tl = null;
  function build() {
    reset();
    const t = gsap.timeline({ onComplete: () => { tl = build(); } });
    let at = 0.4;

    // 1 · Baseline on the recipient: the instruction needs the VLM.
    t.call(() => setPhase(0), null, at);
    t.call(() => row(B.log, 'is-vlm', 'baseline', `${KEY} · L3b · VLM`, `→ ${DEST}`), null, at + 0.3);
    fly(t, () => B.log.lastElementChild, () => cards.M5, at + 0.9);
    t.call(bumpRecords, null, at + 1.5);
    at += 2.1;

    // 2 · Four induction observations on Xplorer-C, all through L3b.
    t.call(() => setPhase(1), null, at);
    for (let i = 1; i <= 4; i++) {
      t.call(() => row(C.log, 'is-vlm', `induction ${i}`, `${KEY} · L3b · VLM`, `→ ${DEST}`), null, at + 0.2);
      fly(t, () => C.log.lastElementChild, () => cards.M5, at + 0.6);
      t.call(bumpRecords, null, at + 1.2);
      at += 1.05;
    }

    // 3 · Promotion gate: grouped by canonical key, three candidates judged on consistency.
    at += 0.3;
    t.call(() => setPhase(2), null, at);
    candRows.forEach((r, i) => {
      t.to(r.fill, { scaleX: r.c.c, duration: 0.9, ease: 'power3.out' }, at + 0.2 + i * 0.35);
      t.call(() => r.row.classList.add('is-judged'), null, at + 1.1 + i * 0.35);
    });
    at += 2.6;

    // 4 · Compile: the promoted association enters M3 and the digest.
    t.call(() => { setPhase(3); root.classList.add('is-promoted'); }, null, at);
    t.to(digest, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power3.out' }, at + 0.5);
    t.call(() => root.classList.add('is-compiled'), null, at + 0.5);
    at += 1.8;

    // 5 · Deliberate installation on the recipient (a separate configuration step).
    t.call(() => setPhase(4), null, at);
    fly(t, () => digest, () => B.badge, at + 0.3, 'is-digest');
    t.call(() => { root.classList.add('is-installed'); B.badge.textContent = 'digest installed · 1 association'; B.badge.classList.add('is-new'); }, null, at + 1);
    at += 1.8;

    // 6 · Reuse at Step 0 on Xplorer-B, then a near-miss falls back to L3b.
    t.call(() => setPhase(5), null, at);
    for (let i = 1; i <= 4; i++) {
      t.call(() => { row(B.log, 'is-reuse', `reuse ${i}`, 'Step 0 · Jaccard 1.00 · no VLM call', `→ ${DEST}`); bumpRecords(); }, null, at + 0.15);
      at += 0.55;
    }
    t.call(() => { row(B.log, 'is-vlm', 'near-miss', 'no stored match · L3b · VLM', '→ escalated'); bumpRecords(); }, null, at + 0.4);
    t.to({}, { duration: 4.5 }, at + 0.6);
    return t;
  }

  function staticFrame() {
    reset();
    row(B.log, 'is-vlm', 'baseline', `${KEY} · L3b · VLM`, `→ ${DEST}`);
    for (let i = 1; i <= 4; i++) row(C.log, 'is-vlm', `induction ${i}`, `${KEY} · L3b · VLM`, `→ ${DEST}`);
    for (let i = 1; i <= 4; i++) row(B.log, 'is-reuse', `reuse ${i}`, 'Step 0 · Jaccard 1.00 · no VLM call', `→ ${DEST}`);
    row(B.log, 'is-vlm', 'near-miss', 'no stored match · L3b · VLM', '→ escalated');
    candRows.forEach((r) => { r.row.classList.add('is-judged'); gsap.set(r.fill, { scaleX: r.c.c }); });
    root.classList.add('is-promoted', 'is-compiled', 'is-installed');
    gsap.set(digest, { autoAlpha: 1, y: 0 });
    B.badge.textContent = 'digest installed · 1 association';
    records = 10; m5count.textContent = '10 records';
    setPhase(6);
  }

  if (reducedMotion) staticFrame(); else reset();

  return {
    play() { if (reducedMotion) return; if (!tl) tl = build(); else tl.resume(); },
    pause() { tl?.pause(); },
    destroy() { tl?.kill(); },
  };
}
