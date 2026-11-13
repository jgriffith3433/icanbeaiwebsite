// Every sound module must reach the speakers through js/mix.js (compressor + limiter), with a limiter of its own only as
// the fallback when the mix isn't there. Fails when a module connects a bare gain/oscillator straight to a destination
// without a mix lookup in the same file.
//   node scripts/check-audio-routing.mjs   (part of npm test)
import { readFileSync } from "node:fs";
const files = ["powers", "weather", "main", "pilot", "sfx", "score", "voice", "daysound"];
const bad = [];
for (const f of files) {
  const s = readFileSync(new URL(`../js/${f}.js`, import.meta.url), "utf8");
  if (/\.connect\([^)]*destination\)/.test(s) && !/window\.mix|mixApi\(|day\.mix|Mix\b/.test(s)) bad.push(f);
}
if (bad.length) { console.error("check-audio-routing: goes to the speakers without the mix:", bad.join(", ")); process.exit(1); }
console.log("check-audio-routing: ok");
