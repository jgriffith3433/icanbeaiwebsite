// The Tornado (js/tornado.js): pure caps/settle helpers and the Babylon funnel under the NullEngine.
//
//   node scripts/check-tornado.mjs
//
import * as B from "@babylonjs/core";
import {
  debrisCap,
  shellCount,
  groundGap,
  isGrounded,
  inPlaza,
  plazaCourse,
  DEBRIS_CAP_HIGH,
  DEBRIS_CAP_LOW,
  SHELLS_HIGH,
  SHELLS_LOW,
  createTornadoFx,
} from "../js/tornado.js";

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); return cond; };

ok(debrisCap("high") === DEBRIS_CAP_HIGH && debrisCap("low") === DEBRIS_CAP_LOW, "debris caps 30 / 12");
ok(shellCount("high") === SHELLS_HIGH && shellCount("low") === SHELLS_LOW, "shell counts 3 / 2");
ok(isGrounded(groundGap(0.08, 0.08)), "flush on the ground is grounded");
ok(isGrounded(groundGap(0.09, 0.08)), "1 cm float is still grounded");
ok(!isGrounded(groundGap(0.12, 0.08)), "4 cm float fails");
ok(!isGrounded(groundGap(0.0, 0.08)), "8 cm sunk fails");
ok(inPlaza(118, 26) && !inPlaza(0, 12.6), "plaza rect");
const pc = plazaCourse(118, 26, 1);
ok(pc && pc.axis === "x" && pc.zone === "plaza" && pc.dir === 1, `plaza course ${JSON.stringify(pc)}`);
ok(plazaCourse(-2, 12.6, 1) === null, "avenue cast is not a plaza course");

const engine = new B.NullEngine();
const ctx = {
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  putImageData() {},
  drawImage() {},
  fillRect() {},
  clearRect() {},
  getImageData: () => ({ data: new Uint8ClampedArray(4) }),
};
engine.createCanvas = (w, h) => ({ width: w, height: h, getContext: () => ctx, style: {} });
const scene = new B.Scene(engine);

for (const q of ["high", "low"]) {
  const fx = createTornadoFx(B, scene, {
    quality: () => q,
    physics: () => null,
    surfaceAt: () => 0.07,
    wetAt: () => false,
    specs: () => [
      { kind: "chair", x: 110, z: 24 },
      { kind: "bin", x: 112, z: 25 },
      { kind: "cone", x: 114, z: 26 },
      { kind: "planter", x: 116, z: 27 },
      { kind: "sign", x: 118, z: 28 },
      { kind: "awning", x: 120, z: 29 },
      { kind: "paper", x: 122, z: 30 },
      { kind: "leaf", x: 124, z: 31 },
      { kind: "chair", x: 111, z: 23 },
      { kind: "bin", x: 113, z: 22 },
    ],
  });
  const specs = [
    { kind: "chair", x: 110, z: 24 },
    { kind: "bin", x: 112, z: 25 },
    { kind: "cone", x: 114, z: 26 },
    { kind: "planter", x: 116, z: 27 },
    { kind: "sign", x: 118, z: 28 },
    { kind: "awning", x: 120, z: 29 },
    { kind: "paper", x: 122, z: 24 },
    { kind: "leaf", x: 124, z: 25 },
    { kind: "chair", x: 111, z: 27 },
    { kind: "bin", x: 113, z: 28 },
  ];
  // advance past the Havok wait so the pool builds without physics under NullEngine
  fx.update(1.6, { x: 118, y: 4, z: 20 });
  fx.ensurePool(specs);
  ok(fx.pool.length >= 8, `${q}: pool has ${fx.pool.length} debris`);
  const course = plazaCourse(118, 26, 1);
  const started = fx.start({ ...course, x: 112, z: course.z, from: 108, to: 128 });
  ok(started.shells === shellCount(q), `${q}: started with ${started.shells} shells`);
  ok(started.debrisCap === debrisCap(q), `${q}: debris cap ${started.debrisCap}`);
  let maxLift = 0;
  for (let i = 0; i < 220; i++) {
    fx.update(1 / 30, { x: 118, y: 4, z: 20 });
    const inf = fx.info();
    maxLift = Math.max(maxLift, inf.lifted);
  }
  ok(maxLift >= 8, `${q}: lifted ${maxLift} props (want ≥ 8)`);
  // drain any remaining life
  for (let i = 0; i < 60; i++) fx.update(1 / 30, { x: 118, y: 4, z: 20 });
  const done = fx.info();
  ok(!done.active || done.active.life <= 0, `${q}: funnel faded`);
  ok(done.landed >= 8, `${q}: ${done.landed} landed`);
  const gc = fx.groundCheck();
  ok(gc.floating === 0 && gc.sunk === 0, `${q}: ground check floating ${gc.floating} sunk ${gc.sunk}`);
}

if (problems.length) {
  console.error("check-tornado failed:");
  problems.forEach((p) => console.error(" -", p));
  process.exit(1);
}
console.log("check-tornado: ok");
