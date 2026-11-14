// The feel sensor's animation trace (js/hawkes-feel.js `anim`): feeds the engine-free core synthetic frames and checks that
// footSlideSeconds, stuckStateSeconds, tposeFrames and blendPops are reported, and that each fault is caught and a clean run is not.
import { createFeelCore } from "../js/hawkes-feel.js";

let failed = 0;
const ok = (c, m) => { if (!c) { failed++; console.error("FAIL " + m); } };

function run(frames, seconds, make) {
  const flags = [];
  const core = createFeelCore({ emit: (f) => flags.push(f) });
  const dt = 1 / 60;
  let x = 0;
  for (let i = 0; i < seconds * 60; i++) {
    const f = make(i * dt, i);
    x += (f.body || 0) * dt;
    core.sample({ t: i * dt, dt, player: { x, y: 0, z: 0 }, input: f.input || 0, grounded: f.grounded ?? true, active: true,
      anim: { state: f.state, weights: f.weights || { [f.state]: 1 }, footSpeed: f.foot, bodySpeed: f.body || 0, action: !!f.action, tpose: !!f.tpose } });
  }
  return { m: core.metrics(), flags };
}

// clean: idle, then a walk with feet matching the body, then idle
const fade = (t, at, a, b) => { const w = Math.min(1, Math.max(0, (t - at) / 0.4)); return { [a]: 1 - w, [b]: w }; };
let r = run(0, 6, (t) => (t < 2 ? { state: "idle" } : t < 4 ? { state: "walk", input: 1, body: 1.4, foot: 1.4, weights: fade(t, 2, "idle", "walk") } : { state: "idle", weights: fade(t, 4, "walk", "idle") }));
for (const k of ["anim.footSlideSeconds", "anim.stuckStateSeconds", "anim.tposeFrames", "anim.blendPops"]) ok(k in r.m, `${k} is reported`);
ok(r.m["anim.footSlideSeconds"] === 0 && r.m["anim.stuckStateSeconds"] === 0 && r.m["anim.tposeFrames"] === 0 && r.m["anim.blendPops"] === 0, "a clean run reports zeros");
ok(!r.flags.some((f) => f.severity === "bug"), "a clean run raises no bug");

// a cast pose held with no input or action for 5 s: stuck
r = run(0, 8, (t) => (t < 1 ? { state: "idle" } : { state: "cast" }));
ok(r.m["anim.stuckStateSeconds"] > 3, `a held cast pose is over 3 s (got ${r.m["anim.stuckStateSeconds"]})`);
ok(r.flags.some((f) => f.kind === "stuck-state" && f.severity === "bug"), "stuck-state is a bug flag");

// the same pose while the action is going on, and in the air, is not stuck
r = run(0, 8, () => ({ state: "cast", action: true }));
ok(r.m["anim.stuckStateSeconds"] === 0, "a cast in progress is not stuck");
r = run(0, 8, () => ({ state: "float", grounded: false }));
ok(r.m["anim.stuckStateSeconds"] === 0, "floating is not stuck");

// feet planted while the body moves
r = run(0, 3, () => ({ state: "idle", input: 1, body: 2, foot: 0.1 }));
ok(r.m["anim.footSlideSeconds"] > 2.5, `planted feet are counted (got ${r.m["anim.footSlideSeconds"]})`);

// T-pose frames and a weight pop
r = run(0, 1, (t, i) => ({ state: "idle", tpose: i >= 10 && i < 20 }));
ok(r.m["anim.tposeFrames"] === 10 && r.flags.some((f) => f.kind === "t-pose"), "T-pose frames are counted and flagged");
r = run(0, 1, (t, i) => (i < 30 ? { state: "idle", weights: { idle: 1, walk: 0 } } : { state: "walk", weights: { idle: 0, walk: 1 } }));
ok(r.m["anim.blendPops"] === 2, `a weight jump of 1 in one frame is a pop on both clips (got ${r.m["anim.blendPops"]})`);
r = run(0, 2, (t) => { const w = Math.min(1, t / 0.4); return { state: "walk", weights: { idle: 1 - w, walk: w } }; });
ok(r.m["anim.blendPops"] === 0, "a smooth cross-fade is no pop");

// no trace, no anim metrics (silence is not success)
const core = createFeelCore({});
core.sample({ t: 0, dt: 1 / 60, player: { x: 0, y: 0, z: 0 } });
ok(!("anim.footSlideSeconds" in core.metrics()), "no trace, no anim metrics");

if (failed) { console.error(failed + " failed"); process.exit(1); }
console.log("anim trace ok");
