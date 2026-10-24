import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';

// Every *.html file in the site root is a page. Relative base keeps links working on GitHub Pages
// (served from /<repo>/) and on any static host.
const pages = Object.fromEntries(
  readdirSync(__dirname).filter((f) => f.endsWith('.html')).map((f) => [f.replace('.html', ''), resolve(__dirname, f)]),
);

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 2048,
    chunkSizeWarningLimit: 1200,
    rollupOptions: { input: pages },
  },
  server: { host: true, port: 5173 },
});
