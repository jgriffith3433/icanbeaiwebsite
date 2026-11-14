// Ask markers (js/asks.js): the config has a place for every ask a neighbor makes, and the pure helpers behave.
import { placeFor, VERB_TINT } from "../js/asks.js";
import fs from "node:fs";
globalThis.window = {};
await import("../day.config.js");
const cfg = window.DAY_CONFIG.neighbors;
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.error("FAIL: " + m); } else console.log("ok: " + m); };
const norm = (v) => (v === "lightning" ? "bolt" : v);
const marks = cfg.askMarks;
ok(marks && marks.iconHeight >= 3, "askMarks has an icon height");
cfg.list.forEach((p) => (p.beats || []).filter((b) => b.kind === "ask").forEach((b) => {
  const pl = marks.places[p.id] && marks.places[p.id][norm(b.ability)];
  ok(!!pl && pl.r > 0, `${p.id}'s ${b.ability} ask has a place (${pl && pl.name})`);
  ok(!!VERB_TINT[norm(b.ability)], `${b.ability} has a tint`);
}));
cfg.teach.steps.forEach((s) => {
  const verbs = [s.unlock].concat(s.then ? [s.then.unlock] : []);
  verbs.forEach((v) => ok(!!(marks.places[s.who] && marks.places[s.who][v]), `street: ${s.who}'s ${v} has a place`));
});
const p = placeFor(marks, "nobody", "rain", { x: 3, z: 4 });
ok(p.x === 3 && p.z === 4 && p.r > 0, "no config place falls back to the asker");
ok(marks.places.birdie.rain.z > 21 && marks.places.birdie.rain.z < 67, "Birdie's rain icon is over the park lawn");
ok(fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8").includes('"./asks.js"'), "asks.js is imported by the app");
if (bad) process.exit(1);
console.log("check-asks: all checks passed");
