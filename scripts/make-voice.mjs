// Generate missing Small Weather voice MP3s through Hawkes Gen audio.voice (ElevenLabs).
// Reads day.config.js voice.lines. Skips files that already exist unless --force.
//
//   node scripts/make-voice.mjs
//   node scripts/make-voice.mjs --force bolt-1
//
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { HawkesGen } from "/srv/hawkes/hawkesgen/clients/js/hawkesgen.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const force = process.argv.includes("--force");
const only = process.argv.filter((a) => a.startsWith("--only=")).map((a) => a.slice(7));
const onlyIds = new Set(only.length ? only.flatMap((s) => s.split(",")) : []);

Object.assign(globalThis, { window: globalThis });
await import(pathToFileURL(path.join(root, "day.config.js")).href);
const voice = globalThis.DAY_CONFIG.voice;
const lines = voice.lines || [];
const voiceId = voice.voiceId || "cjVigY5qzO86Huf0OWal";

const gen = new HawkesGen({ project: "icanbe" });
const outDir = path.join(root, "audio", "voice");
fs.mkdirSync(outDir, { recursive: true });

let made = 0;
let skipped = 0;
for (const L of lines) {
  if (onlyIds.size && !onlyIds.has(L.id)) continue;
  const dest = path.join(root, L.file);
  if (!force && fs.existsSync(dest) && fs.statSync(dest).size > 500) {
    skipped++;
    continue;
  }
  console.log(`voice ${L.id}: ${L.text}`);
  const job = await gen.run("audio.voice", {
    params: { text: L.text, voice: voiceId, model: "eleven_v4" },
    labels: { character: "small-weather", line: L.id, group: L.group },
    save_to: outDir,
  });
  const outs = (job && job.outputs) || [];
  const audio = outs.find((o) => o.path || (o.file && /\.mp3$/i.test(o.file))) || outs[0];
  if (!audio) throw new Error(`no output for ${L.id}: ${JSON.stringify(job)}`);
  // save_to may name the file from the asset; rename to the line's path
  const saved = audio.path || path.join(outDir, audio.file || "");
  if (saved && saved !== dest && fs.existsSync(saved)) {
    fs.renameSync(saved, dest);
  } else if (!fs.existsSync(dest) && audio.asset) {
    await gen.download(audio.asset, dest);
  }
  if (!fs.existsSync(dest)) throw new Error(`failed to write ${dest}`);
  made++;
  console.log(`  -> ${L.file} (${fs.statSync(dest).size} bytes)`);
}
console.log(`make-voice: made ${made}, skipped ${skipped}`);
