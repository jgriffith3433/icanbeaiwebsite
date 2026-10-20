// Checks day.config.js voice: DoD Eric id, ~40 lines, groups for powers/weather/episodes,
// and that each MP3 exists under audio/voice/.
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
const voice = globalThis.DAY_CONFIG && globalThis.DAY_CONFIG.voice;
ok(voice, "day.config.js has no voice section");
ok(voice && voice.voiceId === "cjVigY5qzO86Huf0OWal", `voiceId is ${voice && voice.voiceId}, not DoD Eric`);
const lines = (voice && voice.lines) || [];
ok(lines.length >= 35 && lines.length <= 50, `expected about 40 lines, got ${lines.length}`);

const need = ["bolt", "gust", "storm", "tornado", "glide", "episode-open", "episode-close", "day"];
["clear", "clouds", "rain", "storm", "fog", "wind", "snow"].forEach((s) => need.push(`weather-${s}`));
const groups = new Set(lines.map((L) => L.group));
need.forEach((g) => ok(groups.has(g), `missing voice group ${g}`));

const ids = new Set();
for (const L of lines) {
  ok(L.id && L.text && L.file && L.group, `line incomplete: ${JSON.stringify(L)}`);
  ok(!ids.has(L.id), `duplicate voice id ${L.id}`);
  ids.add(L.id);
  ok(!/\b(they|their|theirs|themselves)\b/i.test(L.text), `voice line says they: ${L.id}`);
  const file = path.join(root, L.file);
  ok(fs.existsSync(file), `missing ${L.file}`);
  if (fs.existsSync(file)) ok(fs.statSync(file).size > 500, `${L.file} is too small`);
}

if (problems.length) {
  console.error("check-voice failed:");
  problems.forEach((p) => console.error(" -", p));
  process.exit(1);
}
console.log(`check-voice: ${lines.length} lines, DoD Eric, files present`);
