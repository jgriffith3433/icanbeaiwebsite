// Bake the loop seams into the looping audio files, once (needs ffmpeg). The browser used to run fixLoopSeam over
// every bed 8 s after load (a main-thread stall); now the files are already seamless and each keeps its own length.
//   node scripts/bake-loop-seams.mjs          bake the beds that aren't baked yet
//   node scripts/bake-loop-seams.mjs --check  fail if a listed file is missing or changed since it was baked
// audio/loop-seams.json records each file's baked sha256 and stats, so running it again changes nothing.
import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { fixLoopSeam } from "./loop-seam.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "audio/loop-seams.json");

export const LOOPS = [
  ...["clear", "clouds", "rain", "storm", "fog", "snow"].map((n) => `audio/music/${n}.mp3`),
  ...["city-hum", "rain-asphalt", "rain-roof-light", "rain-downpour", "rain-gutter", "rain-umbrella", "wind", "wind-awning", "sun-birds"].map((n) => `audio/sfx/${n}.mp3`),
];

const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
const checkOnly = process.argv.includes("--check");

function ff(args, input) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { input, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}
function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate,channels,bit_rate", "-of", "json", file]);
  return JSON.parse(r.stdout).streams[0];
}

let bad = 0;
for (const rel of LOOPS) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    console.log(`missing ${rel}`);
    bad++;
    continue;
  }
  const have = sha(file);
  if (manifest[rel] && manifest[rel].sha256 === have) continue;
  if (checkOnly) {
    console.log(`not baked: ${rel}`);
    bad++;
    continue;
  }
  const info = probe(file);
  const sr = Number(info.sample_rate);
  const chs = Number(info.channels);
  const kbps = Math.max(96, Math.min(192, Math.round(Number(info.bit_rate || 128000) / 1000 / 32) * 32));
  const raw = ff(["-i", file, "-f", "f32le", "-acodec", "pcm_f32le", "-ar", String(sr), "-ac", String(chs), "pipe:1"]);
  const f = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
  const len = Math.floor(f.length / chs);
  const planar = Array.from({ length: chs }, (_, c) => {
    const a = new Float32Array(len);
    for (let i = 0; i < len; i++) a[i] = f[i * chs + c];
    return a;
  });
  const fixed = fixLoopSeam({ sampleRate: sr, length: len, numberOfChannels: chs, getChannelData: (c) => planar[c] }, 0.85);
  const out = fixed.buffer;
  const inter = new Float32Array(out.length * chs);
  for (let c = 0; c < chs; c++) {
    const d = out.getChannelData(c);
    for (let i = 0; i < out.length; i++) inter[i * chs + c] = d[i];
  }
  const tmp = `${file}.tmp.mp3`;
  ff(["-f", "f32le", "-ar", String(sr), "-ac", String(chs), "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", `${kbps}k`, tmp], Buffer.from(inter.buffer));
  fs.renameSync(tmp, file);
  manifest[rel] = {
    sha256: sha(file),
    seconds: Math.round((out.length / sr) * 1000) / 1000,
    trimmedSamples: fixed.trimmedSamples,
    fadeSamples: fixed.fadeSamples,
    jumpBefore: fixed.jumpBefore,
    jumpAfter: fixed.jumpAfter,
  };
  console.log(`baked ${rel}: ${(len / sr).toFixed(3)} s -> ${manifest[rel].seconds} s, jump ${fixed.jumpBefore} -> ${fixed.jumpAfter}`);
}
if (!checkOnly) fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
if (bad) process.exit(1);
