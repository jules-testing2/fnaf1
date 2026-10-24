// Closing bands shared by the four platform pages: "Runs the Semantic Autonomy Stack",
// cross-links to the other platforms and a product-specific spec/demo request.
// Rendered into <div data-product-bands> before initSite() runs, so the motion attributes inside
// are wired by the shared motion engine like any static markup.

import { CONTACT_EMAIL } from '../lib/chrome.js';

export const PLATFORMS = [
  { id: 'xplorer', href: 'xplorer.html', name: 'SAIM Xplorer', kind: 'Autonomous mobile robots', img: 'img/xplorer-b.webp', w: 398, h: 458, line: 'One platform, four builds, from indoor mapping to off-road autonomy.' },
  { id: 'g1', href: 'g1.html', name: 'SAIM G1 · FIIRION', kind: 'Humanoid platform', img: 'img/g1.webp', w: 526, h: 1172, line: 'Human-scale reach and dexterity for shared workspaces.' },
  { id: 'go2', href: 'go2.html', name: 'SAIM Go2 · FIIRIDOG', kind: 'Quadruped platform', img: 'img/go2.webp', w: 833, h: 1023, line: 'Rough terrain and confined spaces where wheels cannot go.' },
  { id: 'arms', href: 'arms.html', name: 'SAIM Arm series', kind: '6-DOF manipulation', img: 'img/arm.webp', w: 889, h: 856, line: 'Arms that mount on Xplorer, G1 or a fixed base.' },
];

// The six layers of the Semantic Autonomy Stack (SAS), as defined in the lab's VLM paper.
const LAYERS = [
  ['L5', 'Operational intelligence + memory'],
  ['L4', 'Mission interface'],
  ['L3', 'Semantic reasoning'],
  ['L2', 'Perception'],
  ['L1', 'Navigation execution'],
  ['L0', 'Platform'],
];

/**
 * @param {object} cfg
 * @param {string} cfg.current            platform id of this page
 * @param {string} cfg.title              HTML for the stack band headline
 * @param {string} cfg.body               HTML paragraph(s) for the stack band
 * @param {Object<string,{note:string,tag?:string,state?:'on'|'plan'|'adapt'}>} cfg.layers  keyed by "L0".."L5"
 * @param {string} cfg.ctaTitle           HTML headline of the request band
 * @param {string} cfg.subject            mail subject for the request
 */
export function mountProductBands(cfg) {
  const host = document.querySelector('[data-product-bands]');
  if (!host) return;
  const mail = (s) => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(s)}`;

  const rows = LAYERS.map(([id, name]) => {
    const l = cfg.layers[id];
    const state = l ? l.state || 'on' : 'off';
    return `<li class="pp-layers__row is-${state}">
      <span class="pp-layers__id mono">${id}</span>
      <span class="pp-layers__name">${name}</span>
      <span class="pp-layers__note">${l ? l.note : ''}</span>
      ${l && l.tag ? `<span class="pp-layers__tag mono">${l.tag}</span>` : ''}
    </li>`;
  }).join('');

  const others = PLATFORMS.filter((p) => p.id !== cfg.current).map((p) => `
    <a class="pp-xlink card" href="${p.href}" data-tilt="5" data-spotlight>
      <span class="pp-xlink__img"><img src="${p.img}" alt="" width="${p.w}" height="${p.h}" loading="lazy" decoding="async"></span>
      <span class="mono pp-xlink__kind">${p.kind}</span>
      <span class="h3 pp-xlink__name">${p.name}</span>
      <span class="muted pp-xlink__line">${p.line}</span>
      <span class="link-arrow">Explore</span>
    </a>`).join('');

  host.innerHTML = `
  <section class="section section--ink2 pp-stackband" aria-labelledby="pp-stack-title">
    <div class="pp-stackband__glow" aria-hidden="true"></div>
    <div class="container pp-stackband__grid">
      <div class="stack" style="--stack-gap:1.5rem">
        <p class="eyebrow" data-reveal>Runs the Semantic Autonomy Stack</p>
        <h2 class="h2" id="pp-stack-title" data-split>${cfg.title}</h2>
        <div class="lead" data-reveal>${cfg.body}</div>
        <a class="btn btn--ghost" href="stack.html" data-magnetic data-reveal>Explore the Autonomy Stack <span class="arrow">→</span></a>
      </div>
      <ol class="pp-layers" data-stagger aria-label="Semantic Autonomy Stack layers on this platform">${rows}</ol>
    </div>
  </section>

  <section class="section pp-others" aria-labelledby="pp-others-title">
    <div class="container">
      <div class="pp-others__head">
        <p class="eyebrow" data-reveal>One stack, every body</p>
        <h2 class="h2" id="pp-others-title" data-split>The other <em>platforms</em></h2>
      </div>
      <div class="grid grid-3 pp-others__grid" data-stagger>${others}</div>
    </div>
  </section>

  <section class="pp-request" aria-labelledby="pp-request-title">
    <div class="container pp-request__inner">
      <div>
        <p class="eyebrow" data-reveal>Request specs / demo</p>
        <h2 class="h2" id="pp-request-title" data-split>${cfg.ctaTitle}</h2>
      </div>
      <div class="pp-request__actions" data-reveal>
        <a class="btn btn--fire" href="${mail(cfg.subject + ' · spec sheet request')}" data-magnetic>Request specs <span class="arrow">→</span></a>
        <a class="btn btn--ghost" href="${mail(cfg.subject + ' · demo request')}" data-magnetic>Book a demo</a>
        <p class="mono muted pp-request__mail">${CONTACT_EMAIL}</p>
      </div>
    </div>
  </section>`;
}

/** mailto link for a spec request about one platform or build. */
export const specMail = (what) => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`${what} · spec sheet request`)}`;
