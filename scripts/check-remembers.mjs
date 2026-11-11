// The autopilot's memory: >= 8 `remembers` steps/entries across morning, lunch, commute and evening, each with a
// short `say`; with every fact on, every block still starts when it did without them (the spine never slips), no
// warnings appear, and the other steps keep their random draws (blocks before the first memory step are identical).
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const problems = [];
const ok = (c, m) => { if (!c) problems.push(m); };
Object.assign(globalThis, { window: globalThis });
await import(pathToFileURL(path.join(root, "day.config.js")).href);
await import(pathToFileURL(path.join(root, "js/schedule.js")).href);
const cfg = globalThis.DAY_CONFIG;
const found = [];
const walk = (steps, where) => (steps || []).forEach((s) => {
  if (!s) return;
  if (s.remembers) found.push({ where, r: s.remembers, say: s.say, kids: s.steps });
  walk(s.steps, where);
});
cfg.spine.forEach((b) => walk(b.steps, b.time));
Object.entries(cfg.pools).forEach(([n, es]) => walk(es, "pool " + n));
ok(found.length >= 8, `only ${found.length} memory behaviours`);
const sayOf = (f) => f.say || (f.kids || []).map((k) => k.say).find(Boolean);
found.forEach((f) => { const t = sayOf(f); ok(t && t.length <= 34 && !/[!?]/.test(t), `${f.where}: needs a short say (<= 34 chars): ${t}`); });
const hours = found.map((f) => parseFloat(f.where)).filter((h) => !isNaN(h));
ok(hours.some((h) => h < 10) && hours.some((h) => h >= 12 && h < 13.5) && hours.some((h) => h >= 17.5 && h < 19) && hours.some((h) => h >= 19), "memory steps must span morning, lunch, commute/evening");
const E = globalThis.DayEngine;
const all = { birdieRain: 1, roofRide: 1, storm: 1, botched: 1, answered: 1, parkFlood: 1 };
for (const key of ["2026-11-11", "2026-12-03", "2027-01-20"]) {
  const a = E.build(cfg, key, {}), b = E.build(cfg, key, all);
  ok(!b.errors.length && b.warnings.length === a.warnings.length, `${key}: memory adds errors/warnings ${b.errors.concat(b.warnings)}`);
  ok(a.blocks.map((x) => x.start.toFixed(3)).join() === b.blocks.map((x) => x.start.toFixed(3)).join(), `${key}: a block starts at a different time with memory`);
  ok(b.actions.filter((x) => x.say).length >= 5, `${key}: memory day shows only ${b.actions.filter((x) => x.say).length} voiced steps`);
  ok(a.actions.every((x) => !x.say), `${key}: a day with no memory says memory lines`);
  // blocks before the first memory block are identical (each block has its own random stream)
  const fs = b.actions.find((x) => x.say);
  const before = (d) => d.actions.filter((x) => x.start < b.blocks.find((k) => k.title === fs.block).start).map((x) => [x.start, x.text, x.x, x.z]);
  ok(JSON.stringify(before(a)) === JSON.stringify(before(b)), `${key}: memory changed the day before its first block`);
}
if (problems.length) { console.error("check-remembers failed:"); problems.forEach((p) => console.error(" -", p)); process.exit(1); }
console.log(`check-remembers: ${found.length} memory behaviours, spine unchanged`);
