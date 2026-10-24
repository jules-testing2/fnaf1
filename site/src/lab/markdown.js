// Tiny markdown renderer for the constitution: headings, paragraphs, *em*, **strong**, ordered/unordered
// lists and horizontal rules. Returns { html, toc } where toc lists the ## parts and their ### articles.

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
export const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Renders `md` up to (not including) the first top-level heading named in `stopAt`. */
export function renderMarkdown(md, { stopAt = [] } = {}) {
  const lines = md.split('\n');
  const out = [];
  const toc = [];
  let para = [], list = null, part = null, article = 0;
  const flushPara = () => {
    if (!para.length) return;
    const text = para.join(' ');
    // Paragraphs wrapped in *( ... )* are editorial notes left open in the draft.
    const note = /^\*\(.*\)\*$/.test(text);
    out.push(note ? `<p class="note">${inline(text.slice(2, -2))}</p>` : `<p>${inline(text)}</p>`);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`);
    list = null;
  };
  const flush = () => { flushPara(); flushList(); };

  for (const raw of lines) {
    const line = raw.trim();
    let m;
    if ((m = line.match(/^# (.+)/))) { if (stopAt.includes(m[1])) break; flush(); continue; } // title lives in the hero
    if ((m = line.match(/^## (.+)/))) {
      flush();
      const pm = m[1].match(/^Part ([IVX]+)\. (.+)/);
      const id = slug(m[1]);
      part = { id, num: pm ? pm[1] : '', title: pm ? pm[2] : m[1], label: m[1], items: [] };
      article = 0;
      toc.push(part);
      if (out.length) out.push('</section>');
      out.push(`<section class="part" id="${id}"><h2 class="part__head"><span class="part__num" aria-hidden="true">${part.num}</span><span class="part__title">${pm ? `<small>Part ${pm[1]}</small>` : ''}${esc(part.title)}</span><a class="anchor" href="#${id}" aria-label="Link to ${esc(m[1])}">#</a></h2>`);
      continue;
    }
    if ((m = line.match(/^### (.+)/))) {
      flush();
      article += 1;
      const num = part && part.num ? `${part.num}.${article}` : `${article}`;
      const id = slug(`${part ? part.id : ''}-${m[1]}`);
      part?.items.push({ id, num, title: m[1] });
      out.push(`<h3 class="article__head" id="${id}"><span class="article__num">${num}</span>${esc(m[1])}<a class="anchor" href="#${id}" aria-label="Link to ${esc(m[1])}">#</a></h3>`);
      continue;
    }
    if (/^---+$/.test(line)) { flush(); continue; }
    if ((m = line.match(/^(\d+)\. (.+)/))) { flushPara(); if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] }; } list.items.push(m[2]); continue; }
    if ((m = line.match(/^- (.+)/))) { flushPara(); if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if (!line) { flush(); continue; }
    if (/^\*Draft/.test(line)) continue; // version line is shown as the badge
    flushList();
    para.push(line);
  }
  flush();
  if (toc.length) out.push('</section>');
  return { html: out.join('\n'), toc };
}
