// Shared chrome for the reasoning demos: optional .demo-frame with a mono title bar,
// theme class and an accessible label. Returns the body element the demo draws into.
import './reasoning.css';

export function buildFrame(el, { title, label, legend = '', options = {}, cls = '' }) {
  const theme = options.theme === 'paper' ? 'rz--paper' : 'rz--dark';
  const root = document.createElement('div');
  root.className = `rz ${theme} ${options.compact ? 'rz--compact' : ''} ${cls}`.trim();
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', label);

  if (options.bare) {
    root.classList.add('rz--bare');
    root.innerHTML = '<div class="rz-body"></div>';
  } else {
    root.classList.add('demo-frame');
    root.innerHTML = `
      <div class="demo-frame__bar">
        <span class="mono rz-title"><i class="rz-dot" aria-hidden="true"></i>${title}</span>
        <div class="rz-legend mono">${legend}</div>
      </div>
      <div class="rz-body"></div>`;
  }
  el.innerHTML = '';
  el.appendChild(root);
  return { root, body: root.querySelector('.rz-body') };
}

/** Tiny DOM helper: h('div.cls', 'text') or h('span', { class: 'x' }, children). */
export function h(tag, attrs, ...kids) {
  const [name, ...classes] = tag.split('.');
  const node = document.createElement(name || 'div');
  if (classes.length) node.className = classes.join(' ');
  if (attrs && (typeof attrs === 'string' || attrs instanceof Node || Array.isArray(attrs))) kids.unshift(attrs);
  else if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className += ` ${v}`;
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) node.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return node;
}

export const fmt = (n, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
