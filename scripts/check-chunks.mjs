/* Build chunking and the loading card's boot-error hook (a TDZ "Cannot access 'e' before initialization" once froze the card at 50%).
   Babylon's modules import each other both ways, so splitting it into chunks (by folder, Shaders, Physics...) makes circular chunks and
   the first one evaluated reads another's export before it exists. Rule: every Babylon module goes to ONE chunk. After a build
   (npm run build) `node scripts/check-chunks.mjs dist` also evaluates each Babylon chunk in Node.
   node scripts/check-chunks.mjs [dist] */
import fs from "node:fs";
import path from "node:path";

const root = new URL("../", import.meta.url);
let failed = 0;
const ok = (c, m) => { if (!c) { failed++; console.error("FAIL", m); } };

const cfgMod = (await import(new URL("vite.config.js", root).href)).default;
const mc = cfgMod.build.rollupOptions.output.manualChunks;
const names = new Set();
for (const sub of ["Maths/math.vector", "Shaders/default.fragment", "ShadersWGSL/default.fragment", "Physics/v2/index", "Particles/particleSystem", "PostProcesses/blur", "Rendering/index", "Lights/light", "Cameras/camera", "Probes/x", "Layers/x", "Animations/x", "Meshes/mesh", "Engines/engine"]) {
  names.add(mc(`/p/node_modules/@babylonjs/core/${sub}.js`));
}
ok(names.size === 1 && !names.has(undefined), `Babylon core modules must all go to one chunk, got: ${[...names].join(", ")}`);
ok(mc("/p/js/world.js") === undefined, "game files are left to Rollup");

const index = fs.readFileSync(new URL("index.html", root), "utf8");
ok(/addEventListener\("error"/.test(index) && /addEventListener\("unhandledrejection"/.test(index) && /function bootError/.test(index), "index.html: the loading card must fail (Try again) on a boot exception, not sit at 50%");

const dist = process.argv[2];
if (dist) {
  const dir = path.resolve(dist, "assets");
  for (const f of fs.readdirSync(dir).filter((n) => /^(babylon|havok)-.*\.js$/.test(n))) {
    try { await import(path.join(dir, f)); } catch (e) { ok(false, `${f} throws when evaluated: ${e.message}`); }
  }
}
if (failed) process.exit(1);
console.log("check-chunks: ok");
