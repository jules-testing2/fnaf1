// Real lab footage: a grid (or a single feature) of muted looping clips with captions.
// Clips load only when the reel nears the viewport and play only while it is visible.
//
// options.clips:  [{ src: 'media/x.mp4', poster: 'media/x.webp', title, caption, tag }]
// options.layout: 'grid' (default) | 'feature' (first clip large, rest small) | 'single'
// options.theme:  'dark' (default) | 'paper'

const CSS = `
.reel { display: grid; gap: clamp(10px, 1.4vw, 18px); grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); }
.reel--feature { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.reel--feature .reel__item:first-child { grid-column: span 4; }
.reel--single { grid-template-columns: 1fr; }
@media (max-width: 760px) { .reel--feature { grid-template-columns: repeat(2, minmax(0, 1fr)); } .reel--feature .reel__item:first-child { grid-column: span 2; } }
.reel__item { position: relative; margin: 0; border-radius: var(--radius); overflow: hidden; background: var(--ink-2); box-shadow: inset 0 0 0 1px var(--line); isolation: isolate; }
.reel__item video { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; transform: scale(1.02); transition: transform 1.2s var(--ease-out), filter 0.6s; filter: saturate(0.92); }
.reel__item:hover video { transform: scale(1.06); filter: saturate(1.08); }
.reel__cap { position: absolute; inset: auto 0 0 0; padding: 40px 16px 14px; background: linear-gradient(transparent, rgba(10, 10, 11, 0.86)); color: var(--fg); }
.reel__cap strong { display: block; font-family: var(--font-serif); font-weight: 450; font-size: 1.15rem; line-height: 1.2; }
.reel__cap span { display: block; margin-top: 4px; font-size: 0.82rem; color: var(--fg-dim); max-width: 60ch; }
.reel__tag { position: absolute; top: 12px; left: 12px; z-index: 1; display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: rgba(10, 10, 11, 0.6); backdrop-filter: blur(8px); font-family: var(--font-mono); font-size: 0.66rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg); }
.reel__tag::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--orange); box-shadow: 0 0 8px var(--orange); }
.reel--compact .reel__cap span { display: none; }
.reel__item { cursor: zoom-in; transition: transform 0.6s var(--ease-out), box-shadow 0.6s var(--ease-out); }
/* Smaller clips grow on hover; transform-origin is set from the clip's position so it never spills off screen. */
@media (hover: hover) and (min-width: 761px) {
  .reel--grid .reel__item:hover, .reel--feature .reel__item:not(:first-child):hover { transform: scale(1.5); z-index: 5; box-shadow: 0 40px 90px rgba(0, 0, 0, 0.65), inset 0 0 0 1px var(--line-strong); }
}
.reel-box { position: fixed; inset: 0; z-index: 1002; display: grid; place-items: center; padding: clamp(12px, 4vw, 48px); background: rgba(10, 10, 11, 0.9); backdrop-filter: blur(10px); cursor: zoom-out; opacity: 0; transition: opacity 0.35s; }
.reel-box.is-open { opacity: 1; }
.reel-box video { width: min(100%, 1280px); max-height: 86vh; border-radius: var(--radius); box-shadow: 0 40px 120px rgba(0, 0, 0, 0.7); cursor: auto; }
.reel-box p { margin-top: 14px; color: var(--fg-dim); text-align: center; font-size: 0.9rem; }
`;

let styled = false;

export default function mount(el, { options = {}, reducedMotion }) {
  if (!styled) { document.head.insertAdjacentHTML('beforeend', `<style>${CSS}</style>`); styled = true; }
  const clips = options.clips || [];
  const layout = options.layout || 'grid';
  el.innerHTML = `<div class="reel reel--${layout}${options.compact ? ' reel--compact' : ''}">${clips.map((c) => `
    <figure class="reel__item">
      ${c.tag ? `<span class="reel__tag">${c.tag}</span>` : ''}
      <video muted loop playsinline preload="none" poster="${c.poster || ''}" aria-label="${(c.title || '') + (c.caption ? '. ' + c.caption : '')}"><source src="${c.src}" type="video/mp4"></video>
      ${c.title ? `<figcaption class="reel__cap"><strong>${c.title}</strong>${c.caption ? `<span>${c.caption}</span>` : ''}</figcaption>` : ''}
    </figure>`).join('')}</div>`;

  const videos = [...el.querySelectorAll('video')];
  const items = [...el.querySelectorAll('.reel__item')];

  // Grow toward the free side: clips on the left edge grow rightwards, on the right edge leftwards.
  items.forEach((item) => item.addEventListener('pointerenter', () => {
    const r = item.getBoundingClientRect();
    const x = r.left < innerWidth * 0.25 ? 'left' : r.right > innerWidth * 0.75 ? 'right' : 'center';
    const y = r.top < innerHeight * 0.3 ? 'top' : r.bottom > innerHeight * 0.7 ? 'bottom' : 'center';
    item.style.transformOrigin = `${x} ${y}`;
  }));

  // Click opens the clip large, with controls; Escape or a click outside closes it.
  items.forEach((item, i) => item.addEventListener('click', () => {
    const c = clips[i];
    const box = document.createElement('div');
    box.className = 'reel-box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', c.title || 'Lab footage');
    box.innerHTML = `<div><video src="${c.src}" poster="${c.poster || ''}" autoplay muted loop playsinline controls></video>${c.caption ? `<p>${c.title ? `<b>${c.title}.</b> ` : ''}${c.caption}</p>` : ''}</div>`;
    const close = () => { box.classList.remove('is-open'); setTimeout(() => box.remove(), 350); removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    box.addEventListener('click', (e) => { if (e.target.tagName !== 'VIDEO') close(); });
    addEventListener('keydown', onKey);
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add('is-open'));
  }));
  // Under reduced motion the posters stay; clips play only when clicked.
  if (reducedMotion) {
    videos.forEach((v) => v.addEventListener('click', () => (v.paused ? v.play() : v.pause())));
    return {};
  }
  const playAll = () => videos.forEach((v) => v.play().catch(() => {}));
  const pauseAll = () => videos.forEach((v) => v.pause());
  return { play: playAll, pause: pauseAll, destroy: pauseAll };
}
