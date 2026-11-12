import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

// index.html's module scripts (js/app.js: Babylon 9, Havok, the day; js/playtest.js) are bundled into dist/assets.
// The rest of the site is static and goes into dist as it is: the other pages, the classic scripts they load
// (js/hawkes-release.js, a copy of a shared file; the analytics SDK comes from Gen), releases.json, the CNAME and models/
// (Small Weather's GLB, loaded by URL from day.config.js control.model).
// dist/ is the whole site: .github/workflows/pages.yml publishes it.
const STATIC = ['whatsnew.html', 'privacy.html', 'releases.json', 'CNAME', 'css', 'models', 'audio', 'textures', 'fonts', 'images', 'js/hawkes-release.js', 'js/hawkes-perf.js'];

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
      // js/dialogue.js plays only the clips this lists, so a line whose file isn't in the repo never 404s
      const dlgDir = path.join(outDir, 'audio', 'dialogue');
      fs.mkdirSync(dlgDir, { recursive: true });
      const files = fs.existsSync('audio/dialogue') ? fs.readdirSync('audio/dialogue').filter((n) => /\.mp3$/.test(n)).sort().map((n) => 'audio/dialogue/' + n) : [];
      fs.writeFileSync(path.join(dlgDir, 'index.json'), JSON.stringify({ files }) + '\n');
      // js/sfx.js's foley bank plays only the clips this lists (audio/foley/<kind>-<n>.mp3)
      const folDir = path.join(outDir, 'audio', 'foley');
      fs.mkdirSync(folDir, { recursive: true });
      const fol = fs.existsSync('audio/foley') ? fs.readdirSync('audio/foley').filter((n) => /\.mp3$/.test(n)).sort().map((n) => 'audio/foley/' + n) : [];
      fs.writeFileSync(path.join(folDir, 'index.json'), JSON.stringify({ files: fol }) + '\n');
      // js/ui-art.js loads only the painted webp this lists (textures/ui/*.webp), so missing art never 404s
      const uiDir = path.join(outDir, 'textures', 'ui');
      fs.mkdirSync(uiDir, { recursive: true });
      const uiFiles = fs.existsSync('textures/ui') ? fs.readdirSync('textures/ui').filter((n) => /\.webp$/.test(n)).sort().map((n) => 'textures/ui/' + n) : [];
      fs.writeFileSync(path.join(uiDir, 'index.json'), JSON.stringify({ files: uiFiles }) + '\n');
      // Layered power casts (crack/body/rumble, whoosh, gale, tornado, sun shimmer)
      const powDir = path.join(outDir, 'audio', 'sfx', 'power');
      fs.mkdirSync(powDir, { recursive: true });
      const pow = fs.existsSync('audio/sfx/power') ? fs.readdirSync('audio/sfx/power').filter((n) => /\.mp3$/.test(n)).sort().map((n) => 'audio/sfx/power/' + n) : [];
      fs.writeFileSync(path.join(powDir, 'index.json'), JSON.stringify({ files: pow }) + '\n');
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
