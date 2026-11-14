// Street barks (js/npcbarks.js, day.config.js neighbors.barks): every line is an existing clip, short, and the picker never repeats inside 180 s.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const problems = [];
const ok = (c, m) => { if (!c) problems.push(m); };
Object.assign(globalThis, { window: globalThis });
await import(pathToFileURL(path.join(root, "day.config.js")).href);
const { lineId } = await import(pathToFileURL(path.join(root, "js/dialogue.js")).href);
const { pickBark, repeatsWithin } = await import(pathToFileURL(path.join(root, "js/npcbarks.js")).href);
const B = globalThis.DAY_CONFIG.neighbors.barks;
const first = { birdie: "Birdie", dex: "Dex", quill: "Ines" };
const files = new Set(JSON.parse(fs.readFileSync(path.join(root, "audio/dialogue/index.json"), "utf8")).files);
const all = [];
const chk = (id, text) => {
  all.push(text);
  ok(files.has(`audio/dialogue/${lineId(first[id], text)}.mp3`), `no clip for ${first[id]}: ${text}`);
  ok(text.split(/\s+/).length <= 18, `too long: ${text}`);
};
Object.keys(B.pass).forEach((id) => { ok(first[id], `unknown neighbour ${id}`); B.pass[id].forEach((t) => chk(id, t)); });
Object.keys(B.cast).forEach((id) => Object.values(B.cast[id]).flat().forEach((t) => chk(id, t)));
ok(Object.values(B.pass).flat().length >= 6, "fewer than 6 pass barks");
ok(new Set(all).size === all.length, "a line is in two pools");
// 20 minutes of asking: never the same line twice inside `repeat`
const used = {}, log = [];
for (let t = 0; t < 1200; t += 8) { const x = pickBark(B.pass.dex, used, t, B.repeat); if (x) { used[x] = t; log.push({ t, text: x }); } }
ok(repeatsWithin(log, B.repeat) === 0, "picker repeated a line inside 180 s");
ok(log.length >= 3, "picker went quiet too fast");
if (problems.length) { console.error("check-npc-barks FAILED:\n- " + problems.join("\n- ")); process.exit(1); }
console.log("check-npc-barks ok");
