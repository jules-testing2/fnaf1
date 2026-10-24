// L3 · resolver race: the deterministic L3a cascade and the L3b VLM path, side by side, on a log time axis.
//
// Two different instructions run at once, because in SAS the path is chosen by the instruction itself:
// the fast lane resolves at its first matching step (sub-millisecond resolver compute), the slow lane
// abstains through Steps 0-6 (or is escalated by the negation guard) and waits for VLM inference.
// Numbers are Session E results from the published paper (see reasoning/sas-data.js).
// Options: bare, compact, theme. Returns { play, pause, destroy }.

import gsap from 'gsap';
import { buildFrame, h, fmt } from './reasoning/frame.js';
import { GUARD, STEPS, SESSION_E as E } from './reasoning/sas-data.js';

// Illustrative instructions, resolved the way the frozen v4.8-review algorithm would route them.
const FAST = [
  { text: 'take me to the closest plant', step: 6, node: 'nearest plant node' },
  { text: 'It is too hot in here, take me somewhere I can get some fresh air', step: 0, node: 'plant_5 · stored association' },
  { text: 'go to lab cb204', step: 2, node: 'cb204' },
  { text: 'go to node 8', step: 1, node: 'node 8' },
];
const SLOW = [
  { text: 'take me somewhere I can sit and relax', why: 'no deterministic match', node: 'a resting spot, proposed by the VLM' },
  { text: 'take me to a plant, but not the one by the window', why: 'negation detected', guard: true, node: 'a plant outside the forbidden set' },
];

const DECADES = [0.1, 1, 10, 100, 1000, 10000]; // ms
const logPos = (ms) => Math.min(1, Math.max(0, (Math.log10(Math.max(ms, 0.1)) + 1) / 5));
const PLAYBACK = 2; // VLM wait is shown at 2x speed so the loop stays watchable

export default function mount(el, { options = {}, reducedMotion }) {
  const { root, body } = buildFrame(el, {
    title: 'L3 · deterministic resolver vs VLM escalation',
    label: `Animated comparison of the two L3 paths. The deterministic L3a resolver walks a guard and seven steps and resolves in under one millisecond of resolver computation (Session E median ${E.resolverMedianMs} ms). The L3b path builds a multimodal prompt and waits seconds for VLM inference (mean ${E.vlmMeanS} s). In Session E, ${E.deterministic} of ${E.cycles} decision cycles resolved deterministically.`,
    legend: '<span class="rz-chip rz-chip--fire">L3a</span><span class="rz-chip rz-chip--violet">L3b</span>',
    options,
    cls: 'rr',
  });

  // ---- Lanes ----
  const lane = (kind, tag) => {
    const instr = h('q.rr-instr');
    const time = h('output.rr-time.mono', '—');
    const steps = h('ol.rr-steps');
    const result = h('div.rr-result.mono');
    const node = h('section.rr-lane.rr-lane--' + kind, h('header.rr-lane__head', h('span.rr-tag.mono', tag), time), instr, steps, result);
    return { node, instr, time, steps, result };
  };
  const fast = lane('fast', 'L3a · deterministic resolver');
  const slow = lane('slow', 'L3b · VLM escalation');

  const chip = (id, name) => h('li.rr-step', { 'data-k': id }, h('b', id), h('span', name));
  const fastChips = [chip('G', GUARD.short), ...STEPS.map((s) => chip(s.id, s.short))];
  fast.steps.append(...fastChips);

  const slowGuard = chip('G', GUARD.short);
  const slowAbstain = h('li.rr-step.rr-step--wide', { 'data-k': 'S0–S6' }, h('b', 'S0–S6'), h('span', 'abstain'));
  const slowPrompt = h('li.rr-step.rr-step--wide', h('b', 'Prompt'), h('span', 'graph · objects · memory'));
  const vlmTime = h('span.rr-vlm__t.mono', '0.0 s');
  const slowVlm = h('li.rr-step.rr-step--vlm', h('b', 'VLM'), h('span', 'qwen3.5:4b'), h('i.rr-spin', { 'aria-hidden': 'true' }), vlmTime);
  const slowValid = h('li.rr-step.rr-step--wide', h('b', 'V'), h('span', 'valid node · forbidden-target check'));
  slow.steps.append(slowGuard, slowAbstain, slowPrompt, slowVlm, slowValid);

  // ---- Log-scale time axis ----
  const axis = h('div.rr-axis', { 'aria-hidden': 'true' });
  const ticks = h('div.rr-axis__ticks');
  DECADES.forEach((ms) => {
    const t = h('span.mono', ms < 1 ? `${ms} ms` : ms < 1000 ? `${ms} ms` : `${ms / 1000} s`);
    t.style.left = `${logPos(ms) * 100}%`;
    ticks.append(t);
  });
  const barFast = h('div.rr-bar.rr-bar--fast', h('span.mono', `median ${E.resolverMedianMs} ms`));
  const barSlow = h('div.rr-bar.rr-bar--slow', h('span.mono', `mean ${E.vlmMeanS} s`));
  axis.append(h('div.rr-axis__label.mono', 'time, log scale'), h('div.rr-axis__track', barFast, barSlow), ticks);

  // ---- Reveal and decision mix ----
  const ratio = h('span.rr-ratio__n', '0');
  const reveal = h('div.rr-ratio',
    h('div', ratio, h('span.rr-ratio__x', '×')),
    h('p', `Median decision-latency ratio, accepted L3b vs deterministic decisions in Session E (cluster-bootstrap 95% CI ${fmt(E.latencyRatioCI[0])}–${fmt(E.latencyRatioCI[1])}×). It contrasts naturally selected paths, not one instruction run both ways, and it is not a uniform speedup.`));

  const mixBar = h('div.rr-mix__bar');
  const segs = [...E.byStep.map((n, i) => ({ n, id: STEPS[i].id, label: `${STEPS[i].id} ${STEPS[i].name}: ${n}` })), { n: E.escalated, id: 'L3b', label: `Escalated to L3b: ${E.escalated}` }];
  const segEls = segs.map((s, i) => {
    const d = h('div.rr-seg', { title: s.label, 'data-k': s.id });
    d.style.setProperty('--w', String(s.n / E.cycles));
    d.style.setProperty('--i', String(i));
    if (s.n >= 12) d.append(h('span.mono', s.id));
    return d;
  });
  mixBar.append(...segEls);
  const mix = h('div.rr-mix',
    h('div.rr-mix__head.mono', h('span', h('b', String(E.deterministic)), ` of ${E.cycles} decision cycles resolved without a model call`), h('span', `${E.escalated} → L3b`)),
    mixBar,
    h('p.rr-mix__note', 'Session E, first-resolving step outside the start gate. The share reflects the mix of test blocks, not a resolver-wide rate.'));

  body.append(h('div.rr-lanes', fast.node, slow.node), axis, h('div.rr-foot', reveal, mix));

  // ---- Animation ----
  let round = 0;
  let tl = null;

  function reset(fi, si) {
    const F = FAST[fi], S = SLOW[si];
    [...fastChips, slowGuard, slowAbstain, slowPrompt, slowVlm, slowValid].forEach((c) => c.classList.remove('is-on', 'is-hit', 'is-skip', 'is-warn'));
    fast.instr.textContent = ''; slow.instr.textContent = '';
    fast.result.textContent = ''; slow.result.textContent = '';
    fast.time.textContent = '—'; slow.time.textContent = '—';
    vlmTime.textContent = '0.0 s';
    slowAbstain.querySelector('span').textContent = S.guard ? 'skipped' : 'abstain';
    gsap.set([barFast, barSlow], { scaleX: 0 });
    gsap.set(reveal, { autoAlpha: 0, y: 16 });
    gsap.set(segEls, { scaleX: 0 });
    ratio.textContent = '0';
    root.classList.remove('is-done');
    return { F, S };
  }

  const typeInto = (node, text, dur) => {
    const o = { n: 0 };
    return gsap.to(o, { n: text.length, duration: dur, ease: 'none', onUpdate: () => (node.textContent = text.slice(0, Math.round(o.n))) });
  };

  function build() {
    const fi = round % FAST.length, si = round % SLOW.length;
    round++;
    const { F, S } = reset(fi, si);
    const t = gsap.timeline({ onComplete: () => { tl = build(); } });

    t.add(typeInto(fast.instr, F.text, Math.min(1.1, F.text.length * 0.025)), 0.2);
    t.add(typeInto(slow.instr, S.text, Math.min(1.1, S.text.length * 0.025)), 0.2);

    // Fast lane: guard clear, then steps until the first resolving one.
    let at = 1.5;
    t.call(() => fastChips[0].classList.add('is-on'), null, at);
    for (let i = 0; i <= F.step; i++) {
      at += 0.16;
      const c = fastChips[i + 1];
      t.call(() => c.classList.add(i === F.step ? 'is-hit' : 'is-on'), null, at);
    }
    t.call(() => fastChips.slice(F.step + 2).forEach((c) => c.classList.add('is-skip')), null, at);
    t.to(barFast, { scaleX: logPos(E.resolverMedianMs), duration: 0.35, ease: 'power3.out' }, at);
    t.call(() => {
      fast.time.textContent = '< 1 ms';
      fast.result.textContent = `→ ${STEPS[F.step].id} ${STEPS[F.step].name} → ${F.node}`;
    }, null, at + 0.1);

    // Slow lane: guard (maybe escalates), abstain, prompt, VLM wait, validation.
    let s = 1.5;
    t.call(() => slowGuard.classList.add(S.guard ? 'is-warn' : 'is-on'), null, s);
    s += 0.35;
    t.call(() => slowAbstain.classList.add(S.guard ? 'is-skip' : 'is-warn'), null, s);
    s += 0.4;
    t.call(() => { slow.result.textContent = `escalate · ${S.why}`; slowPrompt.classList.add('is-on'); }, null, s);
    s += 0.5;
    t.call(() => slowVlm.classList.add('is-on', 'is-busy'), null, s);
    const elapsed = { ms: 0 };
    const wait = E.vlmMeanS / PLAYBACK;
    t.to(elapsed, {
      ms: E.vlmMeanS * 1000, duration: wait, ease: 'none',
      onUpdate: () => {
        vlmTime.textContent = `${(elapsed.ms / 1000).toFixed(1)} s`;
        slow.time.textContent = `${(elapsed.ms / 1000).toFixed(1)} s`;
        gsap.set(barSlow, { scaleX: logPos(elapsed.ms) });
      },
    }, s);
    s += wait;
    t.call(() => { slowVlm.classList.remove('is-busy'); slowValid.classList.add('is-hit'); slow.result.textContent = `→ validated → ${S.node}`; }, null, s);

    // Reveal the published ratio and the Session E decision mix.
    s += 0.4;
    t.call(() => root.classList.add('is-done'), null, s);
    t.to(reveal, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power3.out' }, s);
    const r = { v: 0 };
    t.to(r, { v: E.latencyRatio, duration: 1.4, ease: 'power3.out', onUpdate: () => (ratio.textContent = fmt(Math.round(r.v))) }, s);
    t.to(segEls, { scaleX: 1, duration: 0.6, stagger: 0.07, ease: 'power3.out' }, s + 0.2);
    t.to({}, { duration: 4.5 });
    return t;
  }

  function staticFrame() {
    const { F, S } = reset(0, 0);
    fast.instr.textContent = F.text; slow.instr.textContent = S.text;
    fastChips[0].classList.add('is-on');
    for (let i = 0; i <= F.step; i++) fastChips[i + 1].classList.add(i === F.step ? 'is-hit' : 'is-on');
    fastChips.slice(F.step + 2).forEach((c) => c.classList.add('is-skip'));
    fast.time.textContent = '< 1 ms'; slow.time.textContent = `${E.vlmMeanS} s`;
    fast.result.textContent = `→ ${STEPS[F.step].id} ${STEPS[F.step].name} → ${F.node}`;
    slowGuard.classList.add('is-on'); slowAbstain.classList.add('is-warn'); slowPrompt.classList.add('is-on'); slowVlm.classList.add('is-on'); slowValid.classList.add('is-hit');
    vlmTime.textContent = `${E.vlmMeanS} s`;
    slow.result.textContent = `→ validated → ${S.node}`;
    gsap.set(barFast, { scaleX: logPos(E.resolverMedianMs) });
    gsap.set(barSlow, { scaleX: logPos(E.vlmMeanS * 1000) });
    gsap.set(reveal, { autoAlpha: 1, y: 0 });
    gsap.set(segEls, { scaleX: 1 });
    ratio.textContent = fmt(E.latencyRatio);
    root.classList.add('is-done');
  }

  if (reducedMotion) staticFrame();
  else reset(0, 0);

  return {
    play() { if (reducedMotion) return; if (!tl) tl = build(); else tl.resume(); },
    pause() { tl?.pause(); },
    destroy() { tl?.kill(); },
  };
}
