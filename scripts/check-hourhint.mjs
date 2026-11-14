// The hour's hint (js/hourhint.js): every quarter hour of the day has one, the five parts each ask for the right verb, and the
// places are real (inside the city, a tint for the verb, a line and a thanks that are short).
import { hintForHour, answers } from "../js/hourhint.js";
import { VERB_TINT } from "../js/asks.js";
import fs from "node:fs";
globalThis.window = { addEventListener() {}, removeEventListener() {} };
await import("../day.config.js");
const cfg = window.DAY_CONFIG.neighbors.askMarks;
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.error("FAIL: " + m); } else console.log("ok: " + m); };
for (let h = 0; h < 24; h += 0.25) if (!hintForHour(cfg.hours, h)) ok(false, `hour ${h} has no hint`);
ok(true, "every quarter hour has a hint");
[[3, "night", "fog"], [8, "morning", "rain"], [12, "midday", "wind"], [16, "afternoon", "fog"], [20, "evening", "bolt"], [23.5, "night", "fog"]].forEach(([h, id, v]) => {
  const e = hintForHour(cfg.hours, h);
  ok(e && e.id === id && e.verb === v, `${h}:00 -> ${id} ${v}`);
});
cfg.hours.forEach((e) => {
  ok(!!VERB_TINT[e.verb], `${e.id}: ${e.verb} has a tint`);
  ok(e.place && e.place.r > 0 && e.place.x > -40 && e.place.x < 200, `${e.id}: the place is in the city`);
  ok(e.line.split(/\s+/).length <= 14 && e.thanks.split(/\s+/).length <= 10, `${e.id}: the lines are short`);
});
ok(answers("wind", "gale") && answers("bolt", "lightning") && !answers("rain", "fog"), "powers answer their verbs");
ok(fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8").includes('"./hourhint.js"'), "hourhint.js is imported by the app");
if (bad) process.exit(1);
console.log("check-hourhint ok");
