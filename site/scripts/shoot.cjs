// Visual QA: screenshots pages from a running dev/preview server and reports console errors.
// Usage: node scripts/shoot.cjs <page.html> [more pages] [--width=1440] [--height=900] [--full] [--out=dir] [--base=http://localhost:5173/] [--scroll]
//   --scroll  scrolls through the page first so scroll-triggered animations fire before the shot
//   --at=0.5  also take a viewport shot at this fraction of the page height (repeatable, comma separated)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const flag = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=').slice(1).join('=') : d; };
const has = (n) => args.includes(`--${n}`);
const pages = args.filter((a) => !a.startsWith('--'));
const width = Number(flag('width', 1440)), height = Number(flag('height', 900));
const base = flag('base', 'http://localhost:5173/');
const out = flag('out', path.resolve('.shots'));
const at = flag('at', '').split(',').filter(Boolean).map(Number);
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  for (const p of pages.length ? pages : ['index.html']) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
    await page.goto(base + p, { waitUntil: 'networkidle' }).catch((e) => errors.push(`[nav] ${e.message}`));
    await page.waitForTimeout(1800);
    const name = p.replace('.html', '') + `-${width}`;
    await page.screenshot({ path: path.join(out, `${name}-top.png`) });
    if (has('scroll') || has('full') || at.length) {
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < h; y += Math.round(height * 0.6)) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(140); }
      await page.waitForTimeout(1200);
      for (const f of at) {
        await page.evaluate((y) => window.scrollTo(0, y), Math.round(h * f));
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(out, `${name}-at${Math.round(f * 100)}.png`) });
      }
      if (has('full')) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(out, `${name}-full.png`), fullPage: true });
      }
      console.log(`${p}: height ${h}px`);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) errors.push(`[layout] horizontal overflow of ${overflow}px`);
    console.log(`${p}: ${errors.length ? errors.join('\n  ') : 'no console errors'}`);
    await page.close();
  }
  await browser.close();
  console.log(`shots in ${out}`);
})();
