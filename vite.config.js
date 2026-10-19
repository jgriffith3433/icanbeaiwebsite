import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

// index.html's module scripts (js/app.js: Babylon 9, Havok, the day; js/playtest.js) are bundled into dist/assets.
// The rest of the site is static and goes into dist as it is: the other pages, the classic scripts they load
// (js/hawkes-analytics.js and js/hawkes-release.js, copies of shared files), releases.json, the CNAME and models/
// (Small Weather's GLB, loaded by URL from day.config.js control.model).
// dist/ is the whole site: .github/workflows/pages.yml publishes it.
const STATIC = ['whatsnew.html', 'privacy.html', 'releases.json', 'CNAME', 'css', 'models', 'js/hawkes-analytics.js', 'js/hawkes-release.js'];

function copyStatic() {
  let outDir = 'dist';
  return {
    name: 'icanbe-static',
    apply: 'build',
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      for (const f of STATIC) {
        if (!fs.existsSync(f)) continue;
        fs.cpSync(f, path.join(outDir, f), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  base: './',
  appType: 'mpa',
  plugins: [copyStatic()],
  optimizeDeps: { exclude: ['@babylonjs/havok'] }, // its .wasm is loaded by URL (js/app.js)
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 9000, // Babylon is one big chunk, as the CDN file was
  },
  server: {
    host: '0.0.0.0',
    port: 8092,
    strictPort: true,
    open: false,
    headers: { 'Cache-Control': 'no-store' }, // always serve fresh files while testing
  },
  preview: {
    port: 8093,
    strictPort: true,
    headers: { 'Cache-Control': 'no-store' },
  },
});
