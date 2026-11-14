/* The stem score's pure parts (js/stems.js): the motif, the beat grid, the intent -> layer levels, the synthesized stems' plans,
   and that the config and the recipes agree. The WebAudio side is played by the `stem-score` playtest. Run by npm test. */
import { DEFAULTS, noteHz, nextGrid, levelsFor, stemPlan } from "../js/stems.js";
import fs from "node:fs";

let bad = 0;
const ok = (cond, msg) => { if (!cond) { bad++; console.error("FAIL", msg); } };

ok(Math.abs(noteHz("A4") - 440) < 1e-6 && Math.abs(noteHz("A3") - 220) < 1e-6, "A4 is 440 Hz, A3 220");
ok(DEFAULTS.motif.length === 4, "the motif is four notes");
const bar = (60 / DEFAULTS.bpm) * DEFAULTS.beats;
ok(Math.abs(bar - 2) < 1e-9, `a bar is 2 s (got ${bar})`);
ok(Math.abs(nextGrid(10.3, 10, 0.5) - 10.5) < 1e-9 && Math.abs(nextGrid(10.5, 10, 0.5) - 10.5) < 1e-9 && nextGrid(9, 10, 0.5) === 10, "the next beat line");
const calm = levelsFor({ control: true }), wind = levelsFor({ control: true, windup: true }), big = levelsFor({ control: true, windup: true, storm: true });
ok(calm.calm === 1 && calm.tension === 0 && calm.storm === 0, "walking is calm");
ok(wind.tension > calm.tension && wind.storm === 0, "a wind-up raises the tension layer");
ok(big.storm === 1 && big.storm > wind.storm, "a big cast brings the storm layer in");
const off = levelsFor({ control: false, storm: true });
ok(off.calm === 0 && off.tension === 0 && off.storm === 0, "off control, the stems are silent (the beds play)");
const c = Object.assign({}, DEFAULTS);
for (const k of ["calm", "tension", "storm"]) {
  const p = stemPlan(k, c);
  ok(Math.abs(p.length - c.bars * bar) < 1e-9, `${k} stem loops on a bar line`);
  ok(p.ev.length > 0 && p.ev.every((e) => e.t >= 0 && e.t < p.length && e.hz > 20), `${k} stem notes are inside the loop`);
}
const cfgSrc = fs.readFileSync(new URL("../day.config.js", import.meta.url), "utf8");
ok(/stems:\s*\{[^}]*bpm: 120/.test(cfgSrc), "day.config.js score.stems is at 120 BPM");
const rec = JSON.parse(fs.readFileSync(new URL("../hawkes.assets.json", import.meta.url), "utf8")).assets.map((a) => a.id);
for (const id of ["music-stem-calm", "music-stem-tension", "music-stem-storm", "music-sting-resolution", "music-sting-failure"]) ok(rec.includes(id), `recipe ${id}`);
// a file named in the config must exist (a 404 is a console error)
for (const m of cfgSrc.matchAll(/stems:\s*\{[\s\S]*?files:\s*\{([^}]*)\}/g)) for (const f of m[1].matchAll(/"(audio\/[^"]+)"/g)) ok(fs.existsSync(new URL("../" + f[1], import.meta.url)), `file ${f[1]} exists`);
const stemsSrc = fs.readFileSync(new URL("../js/stems.js", import.meta.url), "utf8");
ok(/fetch\(url,\s*\{\s*priority:\s*"low"\s*\}\)/.test(stemsSrc), "stems fetch with low priority");
ok(!/window\.addEventListener\("day:control",\s*\(\)\s*=>\s*\{\s*S\.firstInput\s*=\s*true/.test(stemsSrc), "day:control does not start stem fetches before the first cast");
const scoreSrc = fs.readFileSync(new URL("../js/score.js", import.meta.url), "utf8");
ok(!/loadUrl\(c\.sting\)\.then/.test(scoreSrc), "sting() does not fetch take-control.mp3 on take control");
if (bad) process.exit(1);
console.log("stems ok");
