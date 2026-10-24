// Constitution: long-form reader. The markdown source (src/lab/constitution-v0.3.md) is rendered at load by a
// tiny local parser; the internal "Open questions" / "Passages to confirm" appendices are not published.

import { initSite, ScrollTrigger, gsap, reducedMotion } from '../lib/site.js';
import '../styles/pages/lab.css';
import md from '../lab/constitution-v0.3.md?raw';
import { renderMarkdown } from '../lab/markdown.js';

// Key principles, quoted verbatim, shown as pull quotes after the paragraph that contains them.
const PULL_QUOTES = [
  'It is written to be held against us.',
  'Scarcity taught us the architecture before abundance let us run it.',
  'Local computation is a privacy property before it is a latency property.',
  'The robot moves. The human decides.',
  'A quiet edit to a commitment is a broken commitment.',
];

const doc = document.querySelector('.cx-doc');
const { html, toc } = renderMarkdown(md, { stopAt: ['Open questions', 'Passages to confirm'] });
doc.innerHTML = html + '<p class="cx-end" aria-hidden="true">∎</p>';

doc.querySelectorAll('p').forEach((p) => {
  const q = PULL_QUOTES.find((s) => p.textContent.includes(s));
  if (q) p.insertAdjacentHTML('afterend', `<blockquote class="pull"><p>${q}</p></blockquote>`);
});
doc.querySelectorAll('.part').forEach((s) => s.querySelector(':scope > p')?.classList.add('dropcap'));
doc.querySelector('#summary ol')?.classList.add('principles');
doc.querySelector('#part-v-what-we-will-not-do ul')?.classList.add('refusals');

const words = md.split(/\s+/).length;
document.querySelector('[data-readtime]').textContent = `${toc.length} sections · about ${Math.round(words / 230)} min read`;

// Table of contents: parts, with each part's articles nested.
const list = document.querySelector('.cx-toc__list');
list.innerHTML = toc.map((p) => `<li data-part="${p.id}"><a href="#${p.id}"><span>${p.num}</span>${p.title}</a>${p.items.length ? `<ol>${p.items.map((a) => `<li><a href="#${a.id}"><span>${a.num}</span>${a.title}</a></li>`).join('')}</ol>` : ''}</li>`).join('');

initSite();

// Mobile drawer
const toc$ = document.querySelector('.cx-toc');
const toggle = toc$.querySelector('.cx-toc__toggle');
const setOpen = (open) => { toc$.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', String(open)); };
toggle.addEventListener('click', () => setOpen(!toc$.classList.contains('is-open')));
list.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });

// Scroll spy + reading progress
const current = toc$.querySelector('.cx-toc__current');
const pct = toc$.querySelector('.cx-toc__pct');
const bar = toc$.querySelector('.cx-toc__progress i');
const links = new Map([...list.querySelectorAll('a')].map((a) => [a.getAttribute('href').slice(1), a]));
const activate = (id) => {
  list.querySelectorAll('.is-active').forEach((el) => el.classList.remove('is-active'));
  const a = links.get(id);
  if (!a) return;
  a.classList.add('is-active');
  a.closest('[data-part]')?.classList.add('is-active');
  current.textContent = a.lastChild.textContent;
};
doc.querySelectorAll('.part, .article__head').forEach((el) => {
  ScrollTrigger.create({ trigger: el, start: 'top 40%', end: 'bottom 40%', onEnter: () => activate(el.id), onEnterBack: () => activate(el.id) });
});
ScrollTrigger.create({
  trigger: doc, start: 'top 60%', end: 'bottom bottom',
  onUpdate: (s) => { bar.style.transform = `scaleY(${s.progress})`; pct.textContent = `${Math.round(s.progress * 100)}%`; },
});

if (!reducedMotion) {
  gsap.utils.toArray('.part__num, .pull').forEach((el) => gsap.from(el, { opacity: 0, y: 30, duration: 1.2, scrollTrigger: { trigger: el, start: 'top 88%' } }));
}
