// Ask markers (js/asks.js): the config has a place for every ask a neighbor makes, and the pure helpers behave.
import { placeFor, VERB_TINT } from "../js/asks.js";
import fs from "node:fs";
globalThis.window = { addEventListener() {}, removeEventListener() {} };
await import("../day.config.js");
const cfg = window.DAY_CONFIG.neighbors;
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.error("FAIL: " + m); } else console.log("ok: " + m); };
const norm = (v) => (v === "lightning" ? "bolt" : v);
const marks = cfg.askMarks;
ok(marks && marks.iconHeight >= 3, "askMarks has an icon height");
cfg.list.forEach((p) => (p.beats || []).filter((b) => b.kind === "ask").forEach((b) => {
  const pl = marks.places[p.id] && marks.places[p.id][norm(b.ability)];
  ok(!!pl && pl.r > 0, `${p.id}'s ${b.ability} ask has a place (${pl && pl.name})`);
  ok(!!VERB_TINT[norm(b.ability)], `${b.ability} has a tint`);
}));
cfg.teach.steps.forEach((s) => {
  const verbs = [s.unlock].concat(s.then ? [s.then.unlock] : []);
  verbs.forEach((v) => ok(!!(marks.places[s.who] && marks.places[s.who][v]), `street: ${s.who}'s ${v} has a place`));
});
const p = placeFor(marks, "nobody", "rain", { x: 3, z: 4 });
ok(p.x === 3 && p.z === 4 && p.r > 0, "no config place falls back to the asker");
ok(marks.places.birdie.rain.z > 21 && marks.places.birdie.rain.z < 67, "Birdie's rain icon is over the park lawn");
ok(fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8").includes('"./asks.js"'), "asks.js is imported by the app");

// Reaction glance camera (js/control.js, js/coldopen.js): first cast of each power and any cast aimed at an ask eases to frame
// the reacting spot (Birdie's lawn/pots and the pond at 15,60) in the middle third of the screen above the controls, and cancels on input.
const ctrlSrc = fs.readFileSync(new URL("../js/control.js", import.meta.url), "utf8");
const coldSrc = fs.readFileSync(new URL("../js/coldopen.js", import.meta.url), "utf8");
ok(ctrlSrc.includes("resolveGlanceSpot") && ctrlSrc.includes("cancelGlance") && ctrlSrc.includes("glanceBeta"), "control.js has resolveGlanceSpot, glanceBeta and cancelGlance");
ok(coldSrc.includes('if (verb === "rain") P.aimAt({ x: -19.3, y: 0.4, z: 9.15 })'), "coldopen.js aims the first Rain cast at Birdie's pots (#439: the player's own cast waters the lawn)");

// Verify exact 3D projection at 1280x720 desktop and 390x844 portrait phone from the apartment roof (-21, 6.16, 0.5)
import * as B from "@babylonjs/core";
const engine = new B.NullEngine();
const scene = new B.Scene(engine);
const cam = new B.ArcRotateCamera("cam", 3.1416, 1.22, 5.6, new B.Vector3(-21, 6.16 + 1.35, 0.5), scene);
cam.fov = 0.78;
const gx = -1, gy = 0.06, gz = 39;
const d = Math.hypot(gx - (-21), gz - 0.5);
const dy = (6.16 + 1.35) - gy;
const thetaRay = Math.atan2(dy + 5.6 * Math.cos(1.28), d + 5.6 * Math.sin(1.28));
const aimBeta = Math.max(1.02, Math.min(1.38, Math.PI * 0.5 - thetaRay - 0.035));
const aimAlpha = Math.atan2(gz - 0.5, gx - (-21)) + Math.PI;
cam.alpha = aimAlpha;
cam.beta = aimBeta;
cam.radius = 6.0;
scene.render();
for (const [label, W, H] of [["desktop 1280x720", 1280, 720], ["phone 390x844", 390, 844]]) {
  const vp = new B.Viewport(0, 0, W, H);
  const m = scene.getTransformMatrix();
  const pLawn = B.Vector3.Project(new B.Vector3(-6, 0.06, 33), B.Matrix.IdentityReadOnly, m, vp);
  const pPond = B.Vector3.Project(new B.Vector3(15, 0.07, 60), B.Matrix.IdentityReadOnly, m, vp);
  const arcTop = H - 210;
  ok(pLawn.z > 0 && pLawn.z < 1 && pLawn.x > W * 0.2 && pLawn.x < W * 0.8 && pLawn.y >= H * 0.33 && pLawn.y <= H * 0.66 && pLawn.y < arcTop,
    `${label}: Birdie's lawn projects into the middle third above controls (${Math.round(pLawn.x)},${Math.round(pLawn.y)} px, ${(pLawn.y / H * 100).toFixed(1)}% H)`);
  ok(pPond.z > 0 && pPond.z < 1 && pPond.x > W * 0.2 && pPond.x < W * 0.8 && pPond.y >= H * 0.33 && pPond.y <= H * 0.66 && pPond.y < arcTop,
    `${label}: the pond at 15,60 projects into the middle third above controls (${Math.round(pPond.x)},${Math.round(pPond.y)} px, ${(pPond.y / H * 100).toFixed(1)}% H)`);
}
scene.dispose();
engine.dispose();

if (bad) process.exit(1);
console.log("check-asks: all checks passed");
