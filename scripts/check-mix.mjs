/* Shared mix graph: zones, duck gains, synthesised IRs, occlusion geometry (pure). */
import {
  ZONES, DUCK, IR_SHAPE, PLAZA, duckGains, dbToGain, zoneAt, fillImpulse,
  occludeCutoffHz, occludeGainDb, segmentHitsBox, anyBoxBlocks,
} from "../js/mix-core.js";
import fs from "node:fs";

let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.error("FAIL", m); } };

ok(ZONES.length === 6, "six reverb zones");
ok(ZONES.includes("rooftop") && ZONES.includes("car") && ZONES.includes("office"), "named zones present");
ok(DUCK.musicDb === -8 && DUCK.ambienceDb === -6, "duck −8 / −6 dB");
ok(DUCK.attackMs === 150, "duck attack 150 ms");
ok(Math.abs(dbToGain(-8) - 0.398107) < 0.01, "−8 dB ≈ 0.4 linear");
ok(Math.abs(duckGains(true).music - dbToGain(-8)) < 1e-9, "duckGains music");
ok(duckGains(false).music === 1 && duckGains(false).ambience === 1, "duck off = unity");

const home = { x0: -7, z0: -3.6, x1: 11, z1: 4.6 };
const office = { x0: 128, z0: -3.6, x1: 146, z1: 4.6 };
const bounds = { home, office, plaza: PLAZA, roofY: 4.2 };

ok(zoneAt({ x: -19.5, y: 6.5, z: 3.2 }, bounds) === "rooftop", "apt roof → rooftop");
ok(zoneAt({ x: -19.5, y: 2.6, z: 3.2 }, bounds) === "rooftop", "apt roof landing before full Y → rooftop");
ok(occludeGainDb(true) === -6 && Math.abs(dbToGain(-6) - 0.501) < 0.01, "occlusion −6 dB linear");
ok(zoneAt({ x: 0, y: 0.1, z: 12.6 }, bounds) === "street", "avenue → street");
ok(zoneAt({ x: 118, y: 0.1, z: 26 }, bounds) === "plaza", "plaza paving → plaza");
ok(zoneAt({ x: -4.6, y: 0.1, z: -2.15 }, bounds) === "apartment", "bedroom → apartment");
ok(zoneAt({ x: 0, y: 0.1, z: 0, inCar: true }, bounds) === "car", "inCar → car");
ok(zoneAt({ x: 134, y: 0.1, z: 0 }, bounds) === "office", "desk block → office");
ok(zoneAt({ x: 134, y: 0.1, z: 0, room: "desk" }, bounds) === "office", "desk room tag → office");

for (const z of ZONES) {
  ok(!!IR_SHAPE[z], `IR shape for ${z}`);
  const buf = new Float32Array(2048);
  const meta = fillImpulse(buf, 44100, z);
  ok(meta.samples === 2048 && meta.zone === z, `fillImpulse ${z}`);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  ok(peak > 0.5 && peak <= 1.001, `IR ${z} normalised (peak ${peak.toFixed(3)})`);
}

ok(occludeCutoffHz(true) === 1100, "occlusion cutoff 1.1 kHz");
ok(occludeGainDb(true) === -6, "occlusion −6 dB");
ok(occludeCutoffHz(false) === 18000, "clear path open");

const wall = { x0: 10, z0: -5, x1: 20, z1: 5 };
ok(segmentHitsBox(0, 0, 30, 0, wall), "segment crosses a wall box");
ok(!segmentHitsBox(0, 0, 5, 0, wall), "segment short of the wall");
ok(!segmentHitsBox(12, 0, 15, 0, wall), "both ends inside → not behind");
ok(anyBoxBlocks(0, 0, 30, 0, [wall]), "anyBoxBlocks hits");
ok(!anyBoxBlocks(0, 0, 5, 0, [wall]), "anyBoxBlocks miss");

const mixSrc = fs.readFileSync(new URL("../js/mix.js", import.meta.url), "utf8");
ok(/day\.audio/.test(mixSrc), "mix.js exposes day.audio");
ok(/mix-sliders/.test(mixSrc), "Settings Music/Effects/Voice sliders");
ok(/HRTF/.test(mixSrc), "HRTF panner");
ok(/icanbe\.mix/.test(mixSrc), "levels persist under icanbe.mix");

const appSrc = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
ok(/import \"\.\/mix\.js\"/.test(appSrc), "app.js imports mix before score");

const hud = fs.readFileSync(new URL("../css/hud.css", import.meta.url), "utf8");
ok(/\.mix-sliders/.test(hud) && /min-height:\s*44px/.test(hud), "hud.css places mix sliders ≥44 px");

const pkg = fs.readFileSync(new URL("../package.json", import.meta.url), "utf8");
ok(/check-mix\.mjs/.test(pkg), "npm test runs check-mix");

if (bad) process.exit(1);
console.log("mix ok");
