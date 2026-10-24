// SAIM shared motion layer: scroll progress, staggered reveals, count-ups, tilt, spotlight, magnetic, parallax, stack steps.
(function () {
  if (window.__saimMotion) return; window.__saimMotion = 1;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var E = 'cubic-bezier(.16,1,.3,1)';
  var css = [
    'html{scroll-behavior:smooth}',
    '.m-progress{position:fixed;top:0;left:0;height:2px;width:100%;transform-origin:0 50%;transform:scaleX(0);background:linear-gradient(90deg,#C1121F,#FA520F,#E8A33D);z-index:1000;pointer-events:none}',
    '.m-reveal{opacity:0;translate:0 32px;filter:blur(6px);transition:opacity 1s ' + E + ' var(--d,0ms),translate 1.1s ' + E + ' var(--d,0ms),filter 1s ease var(--d,0ms),transform .6s ' + E + ',box-shadow .6s ease}',
    '.m-reveal.m-in{opacity:1;translate:0 0;filter:none}',
    '.m-lift:hover{transform:translateY(-5px);box-shadow:0 18px 40px rgba(31,31,31,.12)}',
    '.m-seq{display:inline-block;opacity:0;translate:0 .45em;filter:blur(10px);transition:opacity 1.2s ' + E + ',translate 1.2s ' + E + ',filter 1.2s ease}',
    '.m-ready .m-seq{opacity:1;translate:0 0;filter:none}',
    '.m-nav{transition:padding .5s ' + E + ',box-shadow .5s ease}',
    '.m-nav.m-scrolled{padding-top:10px!important;padding-bottom:10px!important;box-shadow:0 10px 30px rgba(31,31,31,.06)}',
    '.m-link{position:relative}',
    '.m-link::after{content:"";position:absolute;left:0;right:0;bottom:-5px;height:1.5px;background:currentColor;transform:scaleX(0);transform-origin:right;transition:transform .5s ' + E + '}',
    '.m-link:hover::after{transform:scaleX(1);transform-origin:left}',
    '.m-marquee{animation:mMarquee 48s linear infinite}',
    '.m-marquee:hover{animation-play-state:paused}',
    '@keyframes mMarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}',
    '.m-pulse{position:absolute;left:50%;top:42%;width:1100px;height:1100px;border-radius:50%;border:1px solid rgba(193,18,31,.22);transform:translate(-50%,-50%) scale(.1);opacity:0;animation:mPulse 7.5s cubic-bezier(.2,.6,.3,1) infinite;pointer-events:none}',
    '@keyframes mPulse{0%{transform:translate(-50%,-50%) scale(.1);opacity:0}10%{opacity:.9}100%{transform:translate(-50%,-50%) scale(1);opacity:0}}',
    '.m-scan{position:absolute;left:0;right:0;top:0;height:160px;background:linear-gradient(180deg,transparent,rgba(250,82,15,.06) 60%,rgba(250,82,15,.16) 98%,transparent);animation:mScan 8s cubic-bezier(.45,0,.55,1) infinite;pointer-events:none}',
    '@keyframes mScan{0%{transform:translateY(-200px);opacity:0}15%{opacity:1}85%{opacity:1}100%{transform:translateY(900px);opacity:0}}',
    '.m-float{animation:mFloat 7s ease-in-out infinite}',
    '@keyframes mFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}',
    '.m-cue{animation:mCue 2.4s ' + E + ' infinite}',
    '@keyframes mCue{0%{transform:scaleY(0);transform-origin:top}45%{transform:scaleY(1);transform-origin:top}55%{transform:scaleY(1);transform-origin:bottom}100%{transform:scaleY(0);transform-origin:bottom}}',
    '[data-spot]{position:relative}',
    '[data-spot]::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:radial-gradient(380px circle at var(--mx,50%) var(--my,50%),rgba(250,82,15,.22),transparent 65%);opacity:0;transition:opacity .5s ease;mix-blend-mode:screen}',
    '[data-spot]:hover::after{opacity:1}',
    '[data-magnetic]{display:inline-block;transition:translate .5s ' + E + ',background .25s ease,color .25s ease}',
    '[data-step]{transition:background .6s ease,border-color .6s ease}',
    '[data-step].m-on{background:rgba(250,82,15,.09)!important;border-color:rgba(250,82,15,.4)!important}',
    '[data-dot]{transition:background .5s ease,border-color .5s ease,box-shadow .5s ease}',
    '[data-step].m-on [data-dot]{background:#FA520F!important;border-color:#FA520F!important;box-shadow:0 0 0 6px rgba(250,82,15,.18)}',
    '@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}.m-reveal,.m-seq{opacity:1!important;translate:none!important;filter:none!important}}'
  ].join('\n');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var bar = document.createElement('div'); bar.className = 'm-progress';
  var navEl = null;

  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('m-in'); io.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  var cio = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { countUp(e.target); cio.unobserve(e.target); } });
  }, { threshold: 0.5 });

  function digitNode(el) {
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) if (/\d/.test(n.nodeValue)) return n;
    return null;
  }
  function prepCount(el) {
    var n = digitNode(el); if (!n) return false;
    var m = n.nodeValue.match(/^([^\d]*?)(\d+(?:\.\d+)?)([\s\S]*)$/); if (!m) return false;
    el.__c = { n: n, pre: m[1], val: parseFloat(m[2]), dec: (m[2].split('.')[1] || '').length, suf: m[3], orig: n.nodeValue };
    return true;
  }
  function countUp(el) {
    var c = el.__c; if (!c || reduce || document.visibilityState === 'hidden') return;
    var t0 = performance.now(), D = 1700;
    c.n.nodeValue = c.pre + (0).toFixed(c.dec) + c.suf;
    setTimeout(function () { c.n.nodeValue = c.orig; }, D + 150);
    function f(t) {
      var k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(2, -10 * k);
      if (k >= 1) { c.n.nodeValue = c.orig; return; }
      c.n.nodeValue = c.pre + (c.val * e).toFixed(c.dec) + c.suf;
      requestAnimationFrame(f);
    }
    requestAnimationFrame(f);
  }

  function scan() {
    if (document.body && !bar.isConnected) document.body.appendChild(bar);
    if (!navEl) {
      navEl = document.querySelector('[data-nav]') || Array.prototype.find.call(document.querySelectorAll('div'), function (d) { return d.style.position === 'sticky'; }) || null;
      if (navEl) navEl.classList.add('m-nav');
    }
    document.querySelectorAll('.saim-nav-links a').forEach(function (a) { a.classList.add('m-link'); });
    document.querySelectorAll('.saim-reveal').forEach(function (el) {
      if (el.__s || !el.parentElement) return;
      var sib = Array.prototype.filter.call(el.parentElement.children, function (c) { return c.classList.contains('saim-reveal'); });
      if (sib.length < 2) return;
      el.__s = 1; el.style.setProperty('--d', Math.min(sib.indexOf(el), 8) * 90 + 'ms');
    });
    document.querySelectorAll('div').forEach(function (g) {
      if (getComputedStyle(g).display !== 'grid' || (navEl && navEl.contains(g)) || g.closest('[data-no-auto]')) return;
      Array.prototype.forEach.call(g.children, function (c, i) {
        if (c.__g || c.classList.contains('saim-reveal') || c.hasAttribute('data-no-auto')) return;
        c.__g = 1;
        c.classList.add('m-reveal');
        c.style.setProperty('--d', Math.min(i, 8) * 80 + 'ms');
        var cs = getComputedStyle(c);
        if (parseFloat(cs.borderTopLeftRadius) > 0 && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && !c.hasAttribute('data-tilt')) c.classList.add('m-lift');
        io.observe(c);
      });
    });
    document.querySelectorAll('[data-count]').forEach(function (el) {
      if (el.__c) return;
      if (prepCount(el)) cio.observe(el);
    });
    onScroll();
  }

  var tick = false;
  function onScroll() {
    var max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, scrollY / max) : 0) + ')';
    if (navEl) navEl.classList.toggle('m-scrolled', scrollY > 24);
    if (!reduce) document.querySelectorAll('[data-parallax]').forEach(function (el) {
      var f = parseFloat(el.getAttribute('data-parallax')) || 0.08;
      var r = el.parentElement.getBoundingClientRect();
      el.style.transform = 'translate3d(0,' + ((r.top + r.height / 2 - innerHeight / 2) * -f).toFixed(1) + 'px,0)';
    });
    var line = innerHeight * 0.6;
    document.querySelectorAll('[data-steps]').forEach(function (c) {
      var r = c.getBoundingClientRect();
      c.style.setProperty('--p', Math.max(0, Math.min(1, (line - r.top) / r.height)).toFixed(3));
      c.querySelectorAll('[data-step]').forEach(function (s) {
        var sr = s.getBoundingClientRect();
        s.classList.toggle('m-on', sr.top + sr.height / 2 < line);
      });
    });
  }
  function reqScroll() { if (tick) return; tick = true; requestAnimationFrame(function () { tick = false; onScroll(); }); }
  addEventListener('scroll', reqScroll, { passive: true, capture: true });
  addEventListener('resize', reqScroll);

  var cur = { tilt: null, mag: null };
  function onMove(e) {
    if (reduce) return;
    var el = e.target && e.target.closest ? e.target : null;
    var tilt = el && el.closest('[data-tilt]');
    if (cur.tilt && cur.tilt !== tilt) cur.tilt.style.transform = '';
    cur.tilt = tilt;
    if (tilt) {
      var r = tilt.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      tilt.style.transform = 'perspective(1000px) rotateX(' + ((0.5 - y) * 6).toFixed(2) + 'deg) rotateY(' + ((x - 0.5) * 8).toFixed(2) + 'deg) translateY(-6px)';
    }
    var spot = el && el.closest('[data-spot]');
    if (spot) {
      var r2 = spot.getBoundingClientRect();
      spot.style.setProperty('--mx', (e.clientX - r2.left) + 'px');
      spot.style.setProperty('--my', (e.clientY - r2.top) + 'px');
    }
    var mag = el && el.closest('[data-magnetic]');
    if (cur.mag && cur.mag !== mag) cur.mag.style.translate = '';
    cur.mag = mag;
    if (mag) {
      var r3 = mag.getBoundingClientRect();
      mag.style.translate = ((e.clientX - r3.left - r3.width / 2) * 0.25).toFixed(1) + 'px ' + ((e.clientY - r3.top - r3.height / 2) * 0.35).toFixed(1) + 'px';
    }
  }
  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', function () { if (cur.tilt) cur.tilt.style.transform = ''; if (cur.mag) cur.mag.style.translate = ''; cur.tilt = cur.mag = null; });

  var t0 = Date.now();
  function ready() {
    var h = document.querySelector('[data-hero]');
    if ((h && h.querySelector('h1')) || Date.now() - t0 > 1500) {
      setTimeout(addReady, 60);
    } else setTimeout(ready, 40);
  }
  function addReady() { document.documentElement.classList.add('m-ready'); }
  ready();
  setTimeout(addReady, 2000);

  var deb = null;
  new MutationObserver(function () { clearTimeout(deb); deb = setTimeout(scan, 120); }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  setTimeout(scan, 400);
})();
