// Extracts and optimises the original design assets into public/img as WebP.
// Run once with `npm run assets`; the output is committed so CI does not need ImageMagick.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';

const SRC = path.resolve('..', 'Copy of SAIM Robotics Website Design');
const OUT = path.resolve('public', 'img');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'saim-assets-'));
fs.mkdirSync(OUT, { recursive: true });

const slots = JSON.parse(fs.readFileSync(path.join(SRC, '.image-slots.state.json'), 'utf8'));
const slotFile = (id) => {
  const f = path.join(TMP, `slot-${id}.png`);
  fs.writeFileSync(f, Buffer.from(slots[id].u.split(',')[1], 'base64'));
  return f;
};
const up = (n) => path.join(SRC, 'uploads', n);
const as = (n) => path.join(SRC, 'assets', n);
// Robot product shots, cut out from their white backgrounds with rembg (isnet-general-use).
const cut = (n) => path.resolve('assets-src', `${n}-cutout.png`);

const jobs = [
  ['xplorer-a', slotFile('xa'), 1400],
  ['xplorer-b', slotFile('xb'), 1400],
  ['xplorer-c', slotFile('xc'), 1400],
  ['xplorer-d', slotFile('xd'), 1400],
  ['g1', cut('g1'), 1400],
  ['go2', cut('go2'), 1400],
  ['arm', cut('arm'), 1400],
  ['logo-black', as('saim-logo-black.png'), 900],
  ['logo-white', as('saim-logo-white.png'), 900],
  ['lynx-reading', as('saim-lynx-reading.png'), 900],
  ['lynx-team', up('about-photo.png'), 1800],
  ['research-ros2', as('research-ros2-icon.png'), 600],
  ['research-route', as('research-route-icon.png'), 600],
  ['research-vlm', as('research-vlm-icon.png'), 600],
  ['layers-sheet-1', up('pasted-1785174738584-0.png'), 2000],
  ['layers-sheet-2', up('pasted-1785175308912-0.png'), 2000],
];
for (const n of ['magnum-1', 'magnum-2', 'lumen-1', 'lumen-2', 'lumen-3', ...Array.from({ length: 9 }, (_, i) => `novum-${i + 1}`)]) {
  jobs.push([`icon-${n}`, as(`icon-${n}.png`), 700]);
}

for (const [name, file, width] of jobs) {
  const img = sharp(file).trim({ threshold: 2 }).resize({ width, withoutEnlargement: true });
  const info = await img.webp({ quality: 86, alphaQuality: 90, effort: 5 }).toFile(path.join(OUT, `${name}.webp`));
  console.log(name.padEnd(16), `${info.width}x${info.height}`, `${(info.size / 1024).toFixed(0)} KB`);
}
fs.rmSync(TMP, { recursive: true, force: true });
