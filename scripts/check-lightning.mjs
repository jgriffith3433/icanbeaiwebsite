// The Lightning bolt (js/lightning.js): the pure channel and the Babylon part under the NullEngine.
//
//   node scripts/check-lightning.mjs
//
import * as B from "@babylonjs/core";
import { forkedBolt, pickConductor, heatAt, heatColor, flashAt, RESTRIKES, COOL_SEC, createBoltFx } from "../js/lightning.js";

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); return cond; };

// the channel: ends fixed, 3-6 forks, forks leave the main channel and stay above the ground
const top = { x: 10, y: 60, z: 4 };
const end = { x: 12, y: 0.1, z: 7 };
for (let seed = 1; seed <= 40; seed++) {
  const b = forkedBolt(top, end, seed);
  ok(b.main[0] === top && b.main[b.main.length - 1] === end, `seed ${seed}: the channel runs from the sky to the target`);
  ok(b.main.length >= 17, `seed ${seed}: the channel is displaced into ${b.main.length} points`);
  ok(b.forks.length >= 3 && b.forks.length <= 6, `seed ${seed}: ${b.forks.length} forks`);
  b.forks.forEach((f) => {
    ok(b.main.includes(f[0]), `seed ${seed}: a fork starts on the main channel`);
    ok(f.every((p) => p.y > end.y - 0.01), `seed ${seed}: a fork stays above the ground`);
  });
  ok(forkedBolt(top, end, seed).main[5].x === b.main[5].x, "the same seed gives the same bolt");
  ok(forkedBolt(top, end, seed, { forks: 2 }).forks.length === 2, "the caller can cap the forks (low quality)");
}
ok(forkedBolt(top, end, 3).main[8].x !== forkedBolt(top, end, 4).main[8].x, "different seeds differ");

// re-strikes: three, all within 300 ms
ok(RESTRIKES.length === 3 && Math.max(...RESTRIKES) <= 0.3 + 1e-9, `re-strikes ${RESTRIKES}`);
ok(flashAt(0) > 0.99 && flashAt(0.19) > 0.5, "each re-strike flashes again");
ok(flashAt(0.19) > flashAt(0.15), "the flash pulses at a re-strike");

// conductors: the tallest within 3 m, else the aim stands
const list = [{ x: 0, y: 20, z: 0, kind: "antenna" }, { x: 1, y: 40, z: 1, kind: "needle" }, { x: 9, y: 80, z: 9, kind: "far" }];
ok(pickConductor(list, 0.5, 0.5, 3).kind === "needle", "the taller conductor in reach wins");
ok(pickConductor(list, 20, 20, 3) === null, "nothing in reach: the aim stands");
ok(pickConductor(list, 9, 12.5, 3) === null && pickConductor(list, 9, 11.9, 3).kind === "far", "reach is 3 m");

// the scorch cools from orange to black over 10 s
ok(heatAt(0) === 1 && heatAt(COOL_SEC) === 0, "heat goes 1 -> 0 in 10 s");
const c0 = heatColor(1);
const c9 = heatColor(heatAt(9));
ok(c0[0] > 0.9 && c0[1] > 0.5 && c0[2] > 0.1, `fresh scorch is orange-white (${c0})`);
ok(Math.max(...c9) < 0.06, `after 9 s it is near black (${c9})`);
ok(Math.max(...heatColor(heatAt(10))) === 0, "after 10 s it is black");

// the Babylon part
const engine = new B.NullEngine();
const ctx = { createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, clearRect() {}, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData() {} };
engine.createCanvas = (w, h) => ({ width: w, height: h, getContext: () => ctx, style: {} });
const scene = new B.Scene(engine);
const cam = new B.FreeCamera("cam", new B.Vector3(0, 2, -10), scene);
const light = new B.PointLight("flash", B.Vector3.Zero(), scene);
for (const q of ["high", "low"]) {
  const fx = createBoltFx(B, scene, { flashLight: light, camera: () => cam, quality: () => q });
  const ev = fx.strike({ x: 5, y: 0.08, z: 8 }, 48, { normal: { x: 0, y: 1, z: 0 } });
  let maxLight = 0, lit = 0, restrikesAt = [];
  let t = 0;
  for (let i = 0; i < 40; i++) { // 40 frames at 60 fps
    fx.update(1 / 60); t += 1 / 60;
    const I = fx.lightI();
    maxLight = Math.max(maxLight, I);
    if (I > 30) lit++;
    const r = fx.info().restrikes;
    if (r > restrikesAt.length) restrikesAt.push(Math.round(t * 1000));
  }
  const inf = fx.info();
  ok(inf.forks >= 1 && (q === "low" ? inf.forks <= 3 : inf.forks >= 3), `${q}: ${inf.forks} forks`);
  ok(inf.restrikes === 3 && restrikesAt.every((ms) => ms <= 420), `${q}: three re-strikes within 400 ms (${restrikesAt})`);
  ok(lit >= 2 && inf.flashFrames >= 2, `${q}: the flash holds for at least 2 frames (${lit}, ${inf.flashFrames})`);
  ok(maxLight >= 50, `${q}: the flash light is strong (${maxLight})`);
  ok(light.range >= 40, "the flash light reaches 40 m");
  ok(inf.decals.length === 1 && inf.decals[0].zOffset <= -1, `${q}: one decal with a depth offset`);
  const d = scene.getMeshByName("strike-scorch");
  ok(d && Math.abs(d.position.y - (0.08 + 0.012)) < 1e-6, `${q}: the decal lies 12 mm above the surface (${d && d.position.y})`);
  ok(inf.afterimage < 0.001 && !inf.afterVisible, `${q}: the afterimage burned out by 0.5 s`);
  ok(inf.particles.sparkCap === (q === "low" ? 70 : 140), `${q}: particle budget ${inf.particles.sparkCap}`);
  for (let i = 0; i < 560; i++) fx.update(1 / 60); // to 10.0 s+
  ok(fx.info().decals.length === 1 && fx.info().decals[0].black, `${q}: the scorch is black at 10 s`);
  for (let i = 0; i < 200; i++) fx.update(1 / 60);
  ok(fx.info().decals.length === 0, `${q}: the cooled decal is handed to the district marks`);
  // a tilted surface: the decal follows the normal
  fx.strike({ x: 1, y: 3, z: 1 }, 50, { normal: { x: 0.6, y: 0.8, z: 0 } });
  const dd = scene.getMeshByName("strike-scorch");
  ok(dd && Math.abs(dd.position.x - (1 + 0.6 * 0.012)) < 1e-6, `${q}: a decal on a slope sits on the normal`);
  fx.dispose();
}

if (problems.length) {
  console.error("lightning checks failed:\n - " + problems.slice(0, 25).join("\n - "));
  process.exit(1);
}
console.log("lightning ok: channel, forks, re-strikes, flash, conductors, scorch cooling, low quality");
process.exit(0);
