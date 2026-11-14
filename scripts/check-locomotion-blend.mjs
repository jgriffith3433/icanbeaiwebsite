// js/avatar.js locomotion blend: walk and run share one phase, the rate follows ground speed over the blended stride
// (feet match the ground), the run share follows speed smoothly, and no clip weight jumps by more than 0.5 in a frame.
import { clipAvatar } from "../js/avatar.js";

let failed = 0;
const ok = (c, m) => { if (!c) { failed++; console.error("FAIL " + m); } };

function group(name, seconds) {
  const g = { name, from: 0, to: seconds * 30, weight: 0, isPlaying: false, speedRatio: 1, frame: 0,
    targetedAnimations: [{ animation: { framePerSecond: 30 } }],
    start() { g.isPlaying = true; }, stop() { g.isPlaying = false; }, goToFrame(f) { g.frame = f; } };
  return g;
}
const WS = 0.86, RS = 1.25, LW = 1.0, LR = 0.7;
const groups = [group("idle", 4), group("walk", LW), group("run", LR)];
const root = { position: { set() {} }, rotation: {}, rotationQuaternion: null, setEnabled() {} };
const av = clipAvatar(root, groups, { clips: ["idle", "walk", "run"], walkStride: WS, runStride: RS });
const [idle, walk, run] = groups;
const dt = 1 / 60;
let prev = av.weights(), maxJump = 0, minRate = 99;
function frames(seconds, speed, clip) {
  for (let i = 0; i < seconds * 60; i++) {
    av.play(clip(speed), speed, dt);
    const w = av.weights();
    for (const k of Object.keys(w)) maxJump = Math.max(maxJump, Math.abs(w[k] - prev[k]));
    prev = w;
  }
}
const pick = (v) => (v < 0.25 ? "idle" : v > 4 ? "run" : "walk");
frames(1, 0, pick); maxJump = 0;
// ramp 0 -> 6 m/s -> 1.2 m/s, and the stick at half and full tilt
for (let v = 0; v <= 6; v += 0.05) frames(0.05, v, pick);
for (let v = 6; v >= 1.2; v -= 0.05) frames(0.05, v, pick);
ok(maxJump <= 0.5, `no weight pop over a speed ramp (max ${maxJump.toFixed(3)})`);
for (const speed of [2.4, 3.5, 5.6]) {
  frames(2, speed, pick);
  const w = av.weights();
  ok(Math.abs(w.walk + w.run + w.idle - 1) < 0.01, `weights add up to 1 at ${speed} m/s`);
  // feet speed = clip stride per loop x cycles per second, blended by weight
  const cyc = walk.speedRatio / LW;
  ok(Math.abs(run.speedRatio / LR - cyc) < 1e-6, `walk and run share one cycle rate at ${speed} m/s`);
  const stride = WS * w.walk / (w.walk + w.run) + RS * w.run / (w.walk + w.run);
  ok(Math.abs(cyc * stride - speed) / speed < 0.12, `feet match the ground at ${speed} m/s (cycle ${cyc.toFixed(2)}/s, stride ${stride.toFixed(2)})`);
  ok(Math.abs(walk.frame / walk.to - run.frame / run.to) < 1e-6, `walk and run stay in phase at ${speed} m/s`);
}
frames(2, 2.4, pick);
ok(av.weights().run < 0.05, "walking pace is nearly all walk");
frames(2, 5.6, pick);
ok(av.weights().run > 0.95, "a full run is nearly all run");
frames(1, 0, pick); maxJump = 0;
ok(av.weights().idle > 0.9 && !run.isPlaying, "back to idle, run stopped");
if (failed) process.exit(1);
console.log("locomotion blend: ok");
