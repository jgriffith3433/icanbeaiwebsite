// Checks day.config.js pilot: 40+ lines, schedule covers 12+ blocks, take/letgo/worried/night,
// no "they" for him, style length, and that schedule texts match a line entry.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const problems = [];
const ok = (cond, msg) => {
  if (!cond) problems.push(msg);
  return cond;
};

Object.assign(globalThis, { window: globalThis });
await import(pathToFileURL(path.join(root, "day.config.js")).href);
const pilot = globalThis.DAY_CONFIG && globalThis.DAY_CONFIG.pilot;
ok(pilot, "day.config.js has no pilot section");

const lines = (pilot && pilot.lines) || [];
ok(lines.length >= 40, `expected 40+ pilot lines, got ${lines.length}`);

const schedule = (pilot && pilot.schedule) || {};
const schKeys = Object.keys(schedule);
ok(schKeys.length >= 12, `schedule needs 12+ block titles, got ${schKeys.length}`);

ok(Array.isArray(pilot.take) && pilot.take.length >= 2, "pilot.take needs 2+ variants");
ok(pilot.letgo && pilot.letgo.default, "pilot.letgo needs a default");
["birdie", "storm", "rain", "wind", "fog", "sun", "rescue", "answered"].forEach((k) => {
  ok(pilot.letgo[k], `pilot.letgo missing ${k}`);
});
ok(Array.isArray(pilot.worried) && pilot.worried.length >= 2, "pilot.worried needs 2+");
ok(Array.isArray(pilot.night) && pilot.night.length >= 2, "pilot.night needs 2+");

const byText = new Set(lines.map((L) => L.text));
schKeys.forEach((k) => {
  ok(byText.has(schedule[k]), `schedule "${k}" text not in pilot.lines: "${schedule[k]}"`);
});
pilot.take.forEach((t) => ok(byText.has(t), `take line not in pilot.lines: "${t}"`));
Object.values(pilot.letgo).forEach((t) => ok(byText.has(t), `letgo line not in pilot.lines: "${t}"`));

const ids = new Set();
for (const L of lines) {
  ok(L.id && L.text && L.file && L.group, `line incomplete: ${JSON.stringify(L)}`);
  ok(!ids.has(L.id), `duplicate pilot id ${L.id}`);
  ids.add(L.id);
  ok(!/\b(they|their|theirs|themselves)\b/i.test(L.text), `pilot line says they: ${L.id}`);
  ok(!/[!?]|😀|🎉/.test(L.text), `pilot line has !/?/emoji: ${L.id}`);
  const words = L.text.trim().split(/\s+/).length;
  ok(words >= 3 && words <= 16, `pilot line length off (${words} words): ${L.id}`);
  // Clips may be pending Gen; only fail size when the file is already present.
  const file = path.join(root, L.file);
  if (fs.existsSync(file)) ok(fs.statSync(file).size > 400, `${L.file} is too small`);
}

const present = lines.filter((L) => fs.existsSync(path.join(root, L.file))).length;
ok(!!pilot.radio && pilot.radio.highpass && pilot.radio.lowpass, "pilot.radio highpass/lowpass required");
ok(!!pilot.ring && pilot.ring.radius, "pilot.ring radius required");

if (problems.length) {
  console.error("check-pilot failed:");
  problems.forEach((p) => console.error(" -", p));
  process.exit(1);
}
console.log(`check-pilot: ${lines.length} lines, ${schKeys.length} schedule blocks, ${present} clips on disk`);
