// Shared behaviour for the three paper pages (RoM-Nav-style information design, SAIM motion language):
// sticky numbered section nav with scroll spy, demo/clip pickers, figure lightbox, BibTeX copy,
// hero scene + entrance, and the "more research" cards.
import { gsap, ScrollTrigger, reducedMotion, initMotion, lenis } from '../lib/motion.js';
import { PAPERS, LAYERS, doiUrl } from './papers.js';
import { heroArt } from './hero-art.js';

export function initPaperPage(slug, artVariant) {
  const paper = PAPERS[slug];
  fillBibtex(paper);
  renderRelated(slug);
  initMotion(document.querySelector('[data-related]') || document.createElement('div'));
  const art = document.querySelector('[data-hero-art]');
  if (art) heroArt(art, artVariant);
  heroIntro();
  initSectionNav();
  initPickers();
  initLightbox();
  initCopy();
  initLayerBadges(paper);
}

/* ---------- Hero ---------- */
function heroIntro() {
  const hero = document.querySelector('.paper-hero');
  if (!hero || reducedMotion) return;
  const tl = gsap.timeline({ delay: 0.35, defaults: { ease: 'saim' } });
  tl.from(hero.querySelectorAll('.paper-hero__crumbs, .paper-hero__eyebrow'), { y: 20, opacity: 0, duration: 0.9, stagger: 0.08 })
    .from(hero.querySelectorAll('.paper-authors > *'), { y: 18, opacity: 0, duration: 0.8, stagger: 0.05 }, 0.5)
    .from(hero.querySelectorAll('.paper-affil, .paper-venue'), { opacity: 0, duration: 0.8, stagger: 0.1 }, 0.75)
    .from(hero.querySelectorAll('.paper-links > *'), { y: 24, opacity: 0, scale: 0.92, duration: 0.8, stagger: 0.07 }, 0.85)
    .from(hero.querySelectorAll('.paper-stat'), { y: 40, opacity: 0, duration: 1, stagger: 0.08 }, 1)
    .from(hero.querySelector('[data-hero-art]'), { opacity: 0, scale: 0.9, duration: 1.6 }, 0.2);
  // The art drifts slower than the text while the hero scrolls away.
  gsap.to(hero.querySelector('[data-hero-art]'), { yPercent: 18, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
}

/* ---------- Sticky section nav + scroll spy ---------- */
function initSectionNav() {
  const nav = document.querySelector('.paper-nav');
  if (!nav) return;
  const links = [...nav.querySelectorAll('a[href^="#"]')];
  const sections = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const thumb = nav.querySelector('.paper-nav__thumb');
  const track = nav.querySelector('.paper-nav__track');
  const fill = nav.querySelector('.paper-nav__progress i');

  // Sit under the site nav while it is visible, slide up when it hides.
  const siteNav = document.querySelector('.site-nav');
  if (siteNav) {
    const sync = () => document.body.classList.toggle('site-nav-hidden', siteNav.classList.contains('is-hidden'));
    new MutationObserver(sync).observe(siteNav, { attributes: true, attributeFilter: ['class'] });
  }

  let active = null;
  const setActive = (id) => {
    if (id === active) return;
    active = id;
    links.forEach((a) => {
      const on = a.getAttribute('href') === `#${id}`;
      a.classList.toggle('is-active', on);
      if (on) {
        a.setAttribute('aria-current', 'location');
        if (thumb) gsap.to(thumb, { x: a.offsetLeft, width: a.offsetWidth, opacity: 1, duration: reducedMotion ? 0 : 0.55, ease: 'power3.out' });
        // Keep the active pill visible on narrow screens without moving the page.
        if (track && (a.offsetLeft < track.scrollLeft || a.offsetLeft + a.offsetWidth > track.scrollLeft + track.clientWidth)) {
          track.scrollTo({ left: a.offsetLeft - 16, behavior: reducedMotion ? 'auto' : 'smooth' });
        }
      } else a.removeAttribute('aria-current');
    });
  };
  sections.forEach((sec) => {
    ScrollTrigger.create({
      trigger: sec, start: 'top 45%', end: 'bottom 45%',
      onToggle: (self) => self.isActive && setActive(sec.id),
    });
  });
  if (fill && sections.length) {
    ScrollTrigger.create({
      trigger: sections[0], endTrigger: sections[sections.length - 1], start: 'top 60%', end: 'bottom bottom',
      onUpdate: (self) => gsap.set(fill, { scaleX: self.progress }),
    });
  }
  // Without Lenis (reduced motion) the browser scrolls; keep the nav offset in mind.
  links.forEach((a) => a.addEventListener('click', (e) => {
    if (lenis) return;
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 120 });
  }));
  window.addEventListener('resize', () => { const a = links.find((l) => l.classList.contains('is-active')); if (a && thumb) gsap.set(thumb, { x: a.offsetLeft, width: a.offsetWidth }); });
}

/* ---------- Demo / clip pickers (tabs) ---------- */
function initPickers() {
  document.querySelectorAll('[data-picker]').forEach((picker) => {
    const tabs = [...picker.querySelectorAll('[role="tab"]')];
    const caption = document.querySelector(picker.dataset.caption || '');
    const steps = picker.closest('section')?.querySelectorAll('[data-step]') || [];
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (!panel) return;
        if (on) {
          panel.hidden = false;
          if (!reducedMotion) gsap.fromTo(panel, { opacity: 0, y: 24, filter: 'blur(8px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7, clearProps: 'filter' });
        } else panel.hidden = true;
      });
      const i = tabs.indexOf(tab);
      steps.forEach((s, k) => s.classList.toggle('is-done', k <= i));
      if (caption && tab.dataset.text) {
        caption.innerHTML = tab.dataset.text;
        if (!reducedMotion) gsap.fromTo(caption, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5 });
      }
      if (focus) tab.focus();
      ScrollTrigger.refresh();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        select(tabs[(i + d + tabs.length) % tabs.length], true);
      });
    });
    steps.forEach((s, k) => s.addEventListener('click', () => tabs[k] && select(tabs[k])));
  });
}

/* ---------- Figure lightbox ---------- */
function initLightbox() {
  const triggers = [...document.querySelectorAll('[data-zoom]')];
  if (!triggers.length) return;
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Figure');
  box.hidden = true;
  box.innerHTML = '<button class="lightbox__close" type="button" aria-label="Close figure">×</button><figure class="lightbox__fig"><img alt=""><figcaption></figcaption></figure>';
  document.body.appendChild(box);
  const img = box.querySelector('img');
  const cap = box.querySelector('figcaption');
  let last = null;

  const close = () => {
    if (box.hidden) return;
    const done = () => { box.hidden = true; document.documentElement.classList.remove('lightbox-open'); lenis?.start(); last?.focus(); };
    if (reducedMotion) done();
    else gsap.to(box, { opacity: 0, duration: 0.3, onComplete: done });
  };
  const open = (btn) => {
    last = btn;
    const src = btn.querySelector('img');
    img.src = src.currentSrc || src.src;
    img.alt = src.alt;
    const fc = btn.closest('figure')?.querySelector('figcaption');
    cap.innerHTML = fc ? fc.innerHTML : '';
    box.hidden = false;
    document.documentElement.classList.add('lightbox-open');
    lenis?.stop();
    box.querySelector('.lightbox__close').focus();
    if (reducedMotion) return;
    const r = src.getBoundingClientRect();
    gsap.fromTo(box, { opacity: 0 }, { opacity: 1, duration: 0.35 });
    // Grow the image out of the thumbnail's position.
    requestAnimationFrame(() => {
      const t = img.getBoundingClientRect();
      if (!t.width) return;
      gsap.from(img, { x: r.left + r.width / 2 - (t.left + t.width / 2), y: r.top + r.height / 2 - (t.top + t.height / 2), scale: r.width / t.width, duration: 0.7, ease: 'power3.out' });
    });
  };
  triggers.forEach((btn) => btn.addEventListener('click', () => open(btn)));
  box.addEventListener('click', (e) => { if (e.target === box || e.target.classList.contains('lightbox__close')) close(); });
  document.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') { e.preventDefault(); box.querySelector('.lightbox__close').focus(); }
  });
}

/* ---------- BibTeX ---------- */
function fillBibtex(paper) {
  const pre = document.querySelector('[data-bibtex]');
  if (pre) pre.textContent = paper.bibtex;
}

function initCopy() {
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const src = document.querySelector(btn.dataset.copy);
      if (!src) return;
      const label = btn.querySelector('span') || btn;
      const text = src.textContent;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Clipboard API unavailable (insecure context): fall back to selecting the text.
        const range = document.createRange();
        range.selectNodeContents(src);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand?.('copy');
      }
      btn.classList.add('is-done');
      const prev = label.textContent;
      label.textContent = 'Copied';
      if (!reducedMotion) gsap.fromTo(btn, { scale: 0.9 }, { scale: 1, duration: 0.5, ease: 'back.out(3)' });
      setTimeout(() => { label.textContent = prev; btn.classList.remove('is-done'); }, 1800);
    });
  });
}

/* ---------- Related papers + layer badges ---------- */
function renderRelated(current) {
  const host = document.querySelector('[data-related]');
  if (!host) return;
  host.innerHTML = Object.values(PAPERS).filter((p) => p.slug !== current).map((p) => `
    <a class="related-card card" href="${p.href}" data-tilt="5" data-spotlight>
      <span class="related-card__meta"><span class="chip">${p.venueShort}</span><span class="mono">${p.area} · ${p.layers.map((l) => `L${l}`).join(' ')}</span></span>
      <span class="related-card__title">${p.title}</span>
      <span class="related-card__blurb">${p.blurb}</span>
      <span class="link-arrow">Read the paper page</span>
    </a>`).join('');
}

function initLayerBadges(paper) {
  document.querySelectorAll('[data-layers]').forEach((host) => {
    host.innerHTML = LAYERS.map((l) => `<span class="layer-pip${paper.layers.includes(l.id) ? ' is-on' : ''}" title="L${l.id} · ${l.name}">L${l.id}</span>`).join('');
  });
}

export { doiUrl };
