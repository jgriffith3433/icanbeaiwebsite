/* The far-city backdrop's pure parts (js/backdrop.js): towers wrap, and the silhouette reads against the horizon at every hour. */
import { towersFor, silhouetteOf } from "../js/backdrop.js";
import fs from "node:fs";
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.error("FAIL", m); } };
const t = towersFor(7102, 34, 96, 0.1, 0.62);
ok(t.length > 20, "enough towers: " + t.length);
ok(t.reduce((a, b) => a + b.w, 0) === 2048, "towers fill the mask exactly");
ok(t[0].h === t[t.length - 1].h, "the mask wraps without a step");
ok(JSON.stringify(t) === JSON.stringify(towersFor(7102, 34, 96, 0.1, 0.62)), "deterministic");
const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
// the horizon colours look.js uses: day, dusk, night
for (const [name, h] of [["day", [156, 186, 208]], ["dusk", [196, 112, 74]], ["night", [18, 36, 62]], ["dawn", [168, 150, 150]]]) {
  const hz = h.map((v) => v / 255);
  const s = silhouetteOf(hz);
  ok(s.every((v) => v >= 0 && v <= 1), name + " in range");
  ok(lum(hz) - lum(s) > 0.04, `${name}: silhouette darker than the horizon by ${(lum(hz) - lum(s)).toFixed(3)}`);
}
ok(/backdrop\.js/.test(fs.readFileSync("js/app.js", "utf8")), "app.js imports backdrop.js");
if (bad) process.exit(1);
console.log("check-backdrop ok");
