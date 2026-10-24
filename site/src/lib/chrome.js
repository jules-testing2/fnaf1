// Site chrome shared by every page: navigation, mobile menu, footer and overlays.
// Pages are flat .html files at the site root, so every link here is relative and works under any base path.

export const NAV = [
  {
    label: 'Platforms',
    items: [
      { href: 'xplorer.html', title: 'SAIM Xplorer', sub: 'Autonomous mobile robots, A to D' },
      { href: 'g1.html', title: 'SAIM G1 · FIIRION', sub: 'Humanoid platform' },
      { href: 'go2.html', title: 'SAIM Go2 · FIIRIDOG', sub: 'Quadruped platform' },
      { href: 'arms.html', title: 'SAIM Arm series', sub: '6-DOF manipulation' },
    ],
  },
  { label: 'Autonomy Stack', href: 'stack.html' },
  {
    label: 'Research',
    href: 'research.html',
    items: [
      { href: 'research.html', title: 'All research', sub: 'Papers behind the stack' },
      { href: 'research-route-planning.html', title: 'Semantic route planning', sub: 'Sensors 2026 · YOLO + LiDAR + Nav2' },
      { href: 'research-covariance.html', title: 'AI dynamic covariance', sub: 'Sensors 2025 · ROS 2 localisation' },
      { href: 'research-vlm-autonomy.html', title: 'VLM semantic autonomy', sub: 'Resolver + cross-robot memory' },
    ],
  },
  {
    label: 'Lab',
    items: [
      { href: 'index.html#about', title: 'About SAIM', sub: 'Systems for Autonomous Intelligent Mobility' },
      { href: 'leadership.html', title: 'Leadership', sub: 'Magnum · Lumen · Novum' },
      { href: 'constitution.html', title: 'Constitution', sub: 'How the lab works' },
    ],
  },
];

export const CONTACT_EMAIL = 'contact@saimrobotics.com';
const DEMO_HREF = `mailto:${CONTACT_EMAIL}?subject=SAIM%20Robotics%20demo%20request`;

const currentFile = () => {
  const f = location.pathname.split('/').pop();
  return f && f.endsWith('.html') ? f : 'index.html';
};

const isCurrent = (entry, file) =>
  entry.href === file || (entry.items || []).some((i) => i.href.split('#')[0] === file && !i.href.includes('#'));

function navHTML(file) {
  const links = NAV.map((entry) => {
    const current = isCurrent(entry, file) ? ' aria-current="page"' : '';
    if (!entry.items) return `<div class="site-nav__item"><a class="site-nav__link" href="${entry.href}"${current}>${entry.label}</a></div>`;
    const menu = entry.items.map((i) => `<a href="${i.href}"><strong>${i.title}</strong><span>${i.sub}</span></a>`).join('');
    const head = entry.href
      ? `<a class="site-nav__link" href="${entry.href}"${current}>${entry.label}</a>`
      : `<button class="site-nav__link" type="button"${current}>${entry.label}</button>`;
    return `<div class="site-nav__item">${head}<div class="site-nav__menu">${menu}</div></div>`;
  }).join('');

  return `
  <nav class="site-nav" aria-label="Main">
    <div class="container site-nav__inner">
      <a class="site-nav__logo" href="index.html" aria-label="SAIM Robotics home"><img src="img/logo-white.webp" alt="SAIM Robotics" width="545" height="218"></a>
      <div class="site-nav__links">${links}</div>
      <div class="site-nav__cta">
        <a class="btn btn--fire btn--sm" href="${DEMO_HREF}" data-magnetic>Request a demo <span class="arrow">→</span></a>
        <button class="site-nav__burger" type="button" aria-label="Open menu" aria-expanded="false"><span></span><span></span></button>
      </div>
    </div>
  </nav>`;
}

function mobileMenuHTML() {
  const groups = NAV.map((entry) => {
    const items = entry.items ? entry.items : [{ href: entry.href, title: entry.label }];
    return `<div class="mobile-menu__group"><span class="mono">${entry.label}</span>${items.map((i) => `<a href="${i.href}">${i.title}</a>`).join('')}</div>`;
  }).join('');
  return `<div class="mobile-menu" id="mobile-menu">${groups}<div class="mobile-menu__group"><a href="${DEMO_HREF}">Request a demo →</a></div></div>`;
}

function footerHTML() {
  const col = (title, links) => `<div><h4>${title}</h4>${links.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</div>`;
  return `
  <footer class="site-footer">
    <div class="container site-footer__cta">
      <p class="eyebrow" data-reveal>Work with the lab</p>
      <h2 class="mega" style="margin-top:24px" data-split>Bring physical autonomy <em class="fire-text">into your operation.</em></h2>
      <div style="margin-top:44px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap" data-reveal>
        <a class="btn btn--fire" href="${DEMO_HREF}" data-magnetic>Request a demo <span class="arrow">→</span></a>
        <a class="btn btn--ghost" href="stack.html" data-magnetic>Explore the Autonomy Stack</a>
      </div>
    </div>
    <div class="container site-footer__grid">
      <div>
        <img src="img/logo-white.webp" alt="SAIM Robotics" width="545" height="218" style="height:40px;width:auto">
        <p class="muted" style="margin-top:18px;max-width:34ch">Systems for Autonomous Intelligent Mobility. A Romanian robotics lab building one perception-to-action stack for every body.</p>
      </div>
      ${col('Platforms', [['xplorer.html', 'SAIM Xplorer'], ['g1.html', 'G1 · FIIRION'], ['go2.html', 'Go2 · FIIRIDOG'], ['arms.html', 'Arm series']])}
      ${col('Research', [['stack.html', 'Semantic Autonomy Stack'], ['research-route-planning.html', 'Semantic route planning'], ['research-covariance.html', 'AI dynamic covariance'], ['research-vlm-autonomy.html', 'VLM semantic autonomy']])}
      ${col('Lab', [['index.html#about', 'About'], ['leadership.html', 'Leadership'], ['constitution.html', 'Constitution'], [`mailto:${CONTACT_EMAIL}`, CONTACT_EMAIL]])}
    </div>
    <div class="container site-footer__bottom"><span>© ${new Date().getFullYear()} SAIM Robotics. All rights reserved.</span><span class="mono">Built on ROS 2 · Nav2 · edge hardware</span></div>
    <div class="site-footer__word" aria-hidden="true">SAIM</div>
  </footer>`;
}

/** Injects nav, mobile menu, footer, cursor, progress bar and page-wipe into the page. */
export function mountChrome() {
  const file = currentFile();
  document.body.insertAdjacentHTML('afterbegin', navHTML(file) + mobileMenuHTML() + '<div class="scroll-progress" aria-hidden="true"></div>');
  if (!document.body.hasAttribute('data-no-footer')) document.body.insertAdjacentHTML('beforeend', footerHTML());
  document.body.insertAdjacentHTML('beforeend',
    '<div class="page-wipe" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>' +
    '<div class="cursor" aria-hidden="true"><div class="cursor__dot"></div><div class="cursor__ring"></div></div>');

  const burger = document.querySelector('.site-nav__burger');
  burger.addEventListener('click', () => {
    const open = document.documentElement.classList.toggle('nav-open');
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  document.querySelectorAll('.mobile-menu a').forEach((a) => a.addEventListener('click', () => document.documentElement.classList.remove('nav-open')));
}
