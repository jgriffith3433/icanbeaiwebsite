// Checks day.config.js barks: >= 12 distinct lines across needs and weather, no repeats, voice rules.
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const problems = [];
const ok = (c, m) => { if (!c) problems.push(m); };
Object.assign(globalThis, { window: globalThis });
await import(pathToFileURL(path.join(root, "day.config.js")).href);
const cfg = globalThis.DAY_CONFIG;
const b = cfg.barks;
ok(b && b.needs && b.weather, "day.config.js has no barks.needs / barks.weather");
const needLines = Object.values((b && b.needs) || {}).flatMap((n) => n.lines || []);
const wxLines = Object.values((b && b.weather) || {}).flat();
const reactLines = Object.values((cfg.weather && cfg.weather.react) || {}).flat().filter((x) => typeof x === "string");
const warmLines = (b.warm || []).flatMap((t) => [...Object.values(t.needs || {}).flat(), ...Object.values(t.weather || {}).flat()]);
ok((b.warm || []).length === 3 && b.warm.every((t, i, a) => t.from >= 1 && (!i || t.from > a[i - 1].from)), "barks.warm needs 3 rising tiers");
ok(warmLines.length >= 12, `warm: ${warmLines.length} lines`);
const all = [...needLines, ...wxLines, ...warmLines];
ok(needLines.length >= 6, `needs: ${needLines.length} lines`);
ok(wxLines.length >= 6, `weather: ${wxLines.length} lines`);
ok(new Set(all).size >= 12, `only ${new Set(all).size} distinct lines`);
const seen = new Set();
[...all, ...reactLines].forEach((t) => {
  ok(!seen.has(t), `repeated line: ${t}`);
  seen.add(t);
  ok(!/\b(they|their|theirs)\b/i.test(t), `says they: ${t}`);
  ok(!/[!?]/.test(t), `exclamation or question: ${t}`);
  ok(t.split(/\s+/).length <= 18, `too long: ${t}`);
  ok(!/\b(pressure|ability|cooldown|energy bar)\b/i.test(t), `game word: ${t}`);
});
["hunger", "thirst", "energy"].forEach((n) => ok(b.needs[n], `no bark for ${n}`));
["rain", "storm", "fog", "wind", "snow", "clear"].forEach((s) => ok((b.weather[s] || []).length, `no bark for ${s}`));
ok(fs.existsSync(path.join(root, "docs/voice-style.md")), "docs/voice-style.md is missing");
if (problems.length) { console.error("check-barks failed:"); problems.forEach((p) => console.error(" -", p)); process.exit(1); }
console.log(`check-barks: ${new Set(all).size} distinct lines (${needLines.length} needs, ${wxLines.length} weather)`);
