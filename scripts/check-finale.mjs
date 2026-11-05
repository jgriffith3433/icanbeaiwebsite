// The finale's stage (js/finale.js) under Babylon's NullEngine: it builds, gathers, answers cues, takes a salvo and comes down clean.
//
//   node scripts/check-finale.mjs
//
import * as B from "@babylonjs/core";
import { createFinale } from "../js/finale.js";

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); return cond; };

const engine = new B.NullEngine();
// Node has no canvas: a stand-in 2D context is enough for the gradients the aurora and sparks draw.
const ctx = { createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, clearRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData() {} };
engine.createCanvas = (w, h) => ({ width: w, height: h, getContext: () => ctx, style: {} });
const scene = new B.Scene(engine);
new B.FreeCamera("cam", new B.Vector3(0, 2, -10), scene);
const before = scene.meshes.length;
const stage = createFinale({ scene }, B, { center: [118, 26], spectators: 24, gatherSec: 4, beams: 6 });
ok(stage && !stage.active(), "the stage exists and is idle before the show");
stage.start(24);
ok(stage.active() && stage.info().spectators === 24, "24 spectators are built");
ok(scene.meshes.length > before + 24 * 3 + 6, `meshes: ${scene.meshes.length - before} added`);
for (let i = 0; i < 700; i++) stage.update(0.016, 0);
ok(stage.info().gathered === 24, `everyone is in place after 11 s (${stage.info().gathered})`);
stage.cue("bolt", "perfect");
stage.cue("rain", "good");
stage.cue("fog", "good");
for (let i = 0; i < 60; i++) stage.update(0.016, 0);
let inf = stage.info();
ok(inf.hits === 3 && inf.bursts >= 3 && inf.beams > 0 && inf.cheer > 0.5, `cues light the stage: ${JSON.stringify(inf)}`);
ok(inf.beamsLit >= 1 && inf.washes >= 1, "beams and neon pools come up on a hit");
const beams0 = inf.beams;
stage.cue("gale", "miss");
ok(stage.info().beams < beams0 + 0.001 && stage.info().hits === 3, "a miss dims the beams and is not a hit");
stage.grand(1);
for (let i = 0; i < 300; i++) stage.update(0.016, 0);
ok(stage.info().aurora > 0.5, `the aurora is up after the grand finish (${stage.info().aurora})`);
const names = new Set(scene.meshes.map((m) => m.name));
ok(names.has("fin-aurora"), "the aurora ribbon is in the scene");
stage.stop();
ok(!stage.active() && scene.meshes.filter((m) => m.name.startsWith("fin-")).length === 0, "stopping removes every mesh");
ok(stage.info().spectators === 0, "no spectators are left");
stage.start(8);
ok(stage.info().spectators === 8, "it can start again");
stage.stop();

if (problems.length) {
  console.error("check-finale failed:");
  problems.forEach((p) => console.error(" -", p));
  process.exit(1);
}
console.log("check-finale: ok");
process.exit(0);
