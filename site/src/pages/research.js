import { initSite, gsap, ScrollTrigger, reducedMotion } from '../lib/site.js';
import '../styles/pages/research.css';
import { scanField } from '../research/scan-field.js';
import { refreshOnLayoutChange } from '../research/paper-page.js';

initSite();
const bg = document.querySelector('.rx-hero__bg');
if (bg) scanField(bg);
refreshOnLayoutChange();

// Layer map: a paper lights the SAS layers it contributes to; auto-cycles until the visitor picks one.
const buttons = [...document.querySelectorAll('.lm-paper')];
const rows = [...document.querySelectorAll('.lm-row')];
let timer = 0;
function select(btn) {
  const layers = btn.dataset.layers.split(',').map(Number);
  buttons.forEach((b) => { b.classList.toggle('is-active', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
  rows.forEach((r) => r.classList.toggle('is-lit', layers.includes(Number(r.dataset.layer))));
}
buttons.forEach((b) => ['click', 'mouseenter', 'focus'].forEach((ev) => b.addEventListener(ev, () => { clearInterval(timer); select(b); })));
if (buttons.length) {
  select(buttons[0]);
  if (!reducedMotion) {
    let i = 0;
    ScrollTrigger.create({ trigger: '.layermap', start: 'top 70%', once: true, onEnter: () => { timer = setInterval(() => select(buttons[(i = (i + 1) % buttons.length)]), 2600); } });
  }
}

// Timeline progress line follows scroll.
const tl = document.querySelector('.rx-timeline');
if (tl && !reducedMotion) ScrollTrigger.create({ trigger: tl, start: 'top 80%', end: 'bottom 50%', scrub: true, onUpdate: (s) => tl.style.setProperty('--p', s.progress.toFixed(3)) });
else if (tl) tl.style.setProperty('--p', 1);
gsap.utils.toArray('.rx-card').forEach((card) => {
  if (reducedMotion) return;
  gsap.from(card.querySelector('.rx-card__fig'), { yPercent: 12, ease: 'none', scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true } });
});
