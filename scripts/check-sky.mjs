/* The sky's pure parts (js/sky-core.js), the painted-sky files and the wiring. Run by npm test. */
import { PANOS, panoWeights, timeWeights, deckFlashStep, deckStrike, gapOpen, DECK_HOLD_FRAMES } from "../js/sky-core.js";
import fs from "node:fs";

let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.error("FAIL", m); } };
const SR = 7.083, SS = 18.416;
const top = (h, cover = 0) => { const w = panoWeights(h, SR, SS, cover); return Object.keys(w).sort((a, b) => w[b] - w[a])[0]; };

// five times of day -> five distinct skies, and the storm one on its own
ok(top(6.5) === "dawn", "06:30 is dawn: " + top(6.5));
ok(top(12) === "noon", "12:00 is noon");
ok(top(17.5) === "golden", "17:30 is golden hour: " + top(17.5));
ok(top(19) === "dusk", "19:00 is dusk: " + top(19));
ok(top(23) === "night" && top(2) === "night", "23:00 and 02:00 are night");
ok(top(12, 0.9) === "storm" && top(23, 0.9) === "storm", "a storm shows the shelf cloud at any hour");
ok(new Set([6.5, 12, 17.5, 19, 23].map((h) => top(h)).concat(top(12, 0.9))).size === 6, "six distinct skies");

// weights sum to 1 and move smoothly (no jump over a minute) all day, and across midnight
let prev = null, worst = 0;
for (let m = 0; m <= 1440 * 2; m++) {
  const h = (m / 60) % 24;
  const w = panoWeights(h, SR, SS, 0.3);
  const s = PANOS.reduce((a, k) => a + w[k], 0);
  ok(Math.abs(s - 1) < 1e-9, "weights sum to 1 at " + h);
  if (prev) for (const k of PANOS) worst = Math.max(worst, Math.abs(w[k] - prev[k]));
  prev = w;
}
ok(worst < 0.02, "a minute never jumps a weight by " + worst);
const mid = timeWeights(0, SR, SS), mid2 = timeWeights(24, SR, SS);
ok(mid.night > 0.999 && mid2.night > 0.999, "midnight has no seam");

// the deck's flash: full for at least 3 frames, then gone
const f = { v: 0, hold: 0 };
deckStrike(f);
let full = 0, frames = 0;
while (frames < 120) { const v = deckFlashStep(f, 1 / 30); if (v > 0.45) full++; frames++; }
ok(DECK_HOLD_FRAMES >= 3 && full >= 3, "the deck stays lit at least 3 frames at 30 fps: " + full);
ok(f.v < 0.01, "and fades out");

// the gap opens fast and closes slowly
let g = 0; for (let i = 0; i < 60; i++) g = gapOpen(g, 1, 1 / 60);
ok(g > 0.85, "the gap is open within a second: " + g);
let c = g; for (let i = 0; i < 60; i++) c = gapOpen(c, 0, 1 / 60);
ok(c > 0.3 && c < g, "and closes slower than it opened");

// wiring
const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
ok(/import "\.\/sky\.js"/.test(app), "js/app.js imports sky.js");
const sky = fs.readFileSync(new URL("../js/sky.js", import.meta.url), "utf8");
ok(/VolumetricLightScatteringPostProcess/.test(sky) && /ReflectionProbe/.test(sky), "god rays and the reflection probe are built");
ok(/quality !== "low" && st\.gap/.test(sky), "no god-ray pass on low quality");
const cfg = fs.readFileSync(new URL("../day.config.js", import.meta.url), "utf8");
const m = cfg.match(/panoramas:\s*\{([^}]*)\}/);
if (m) {
  const paths = [...m[1].matchAll(/"(textures\/sky\/[^"]+)"/g)].map((x) => x[1]);
  ok(paths.length === 5 || paths.length === 6, "panoramas lists the six skies");
  for (const p of paths) {
    const url = new URL("../" + p, import.meta.url);
    ok(fs.existsSync(url), "a listed panorama is in the repo: " + p);
    if (fs.existsSync(url)) ok(fs.statSync(url).size <= 600 * 1024, p + " is at most 600 KB");
  }
}
if (bad) { console.error(bad + " sky check(s) failed"); process.exit(1); }
console.log("sky ok");
