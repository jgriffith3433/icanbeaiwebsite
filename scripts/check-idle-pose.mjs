#!/usr/bin/env node
/* Small Weather's idle on the live skin (Babylon NullEngine, no browser): the clip player and the foot IK run over the
   real GLB and the hero clips, and the pose is read from the bones and the skinned mesh each frame.
   - 10 s of idle: the hands hang at his sides and IN FRONT of the hip line (never behind the back), apart from the
     body, the boots flat (ankle-to-toe pitch and roll near the rest pose's), and no bone jumps more than 3 cm
     between two frames (no pop);
   - returning to idle from walk, run, jump, cast, throw, lookup and the weather beats lands within 3 cm of the idle
     pose (hands and boots) inside 2 s;
   - the very first frame of the first clip is already that clip (no bind pose showing while it fades in).
   The same readings are in the page's `idle-pose` playtest (js/playtest.js). */
import fs from "node:fs";
import * as core from "@babylonjs/core";

const root = new URL("../", import.meta.url);
let failed = 0;
const ok = (c, m) => {
  if (!c) {
    console.error("FAIL:", m);
    failed++;
  }
  return c;
};
class Engine extends core.NullEngine {
  constructor() {
    super({ renderHeight: 360, renderWidth: 640, textureSize: 256, deterministicLockstep: false, lockstepMaxSteps: 1 });
  }
}
const BABYLON = { ...core, Engine };
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => ((t[k] = v), true) });
const document = { createElement: () => ({ getContext: () => ctx2d, width: 0, height: 0, style: {} }) };
const events = { removeAttribute() {}, setAttribute() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
Object.assign(globalThis, { window: globalThis, BABYLON, document, devicePixelRatio: 1, CustomEvent: class { constructor(a, b) { this.detail = b && b.detail; } }, ...events });
const origLog = console.log;
console.log = () => {}; // Babylon's NullEngine banner and warnings
for (const f of ["day.config.js", "js/schedule.js", "js/world.js"]) await import(new URL(f, root).href);
const cfg = globalThis.DAY_CONFIG;
const day = globalThis.DayEngine.build(cfg, "2026-10-19");
const world = globalThis.DayWorld.create({ ...events, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }) }, cfg, day.spots, day.rooms);
const { loadSmallWeather } = await import(new URL("js/small-weather.js", root).href);
const rd = (p) => {
  const b = fs.readFileSync(new URL(p, root));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const extras = {};
for (const n of ["lookup", "windbolt", "windrain", "triumph", "shelter", "window", "cast", "throw", "fall", "float"]) extras[n] = rd(`models/clips/${n}.glb`);
const skin = await loadSmallWeather(world, null, rd(cfg.control.model), { extras });
world.setSkin(skin);
console.log = origLog;

const scene = world.scene;
scene.useConstantAnimationDeltaTime = true;
const DT = 1 / 30;
const node = (n) => skin.root.getChildTransformNodes(false).find((t) => t.name.endsWith(n));
const NAMES = ["Hips", "Spine2", "Head", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "LeftHand", "RightHand", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase", "LeftLeg", "RightLeg"];
const deg = (r) => (r * 180) / Math.PI;
/* every bone in his own frame (metres, +z forward, +x his right) plus the boots' pitch and roll (ankle to toe) */
function read() {
  skin.meshes.forEach((m) => m.skeleton && m.skeleton.prepare(true));
  const inv = skin.root.getWorldMatrix().clone().invert();
  const P = {};
  for (const n of NAMES) P[n] = core.Vector3.TransformCoordinates(node(n).getAbsolutePosition().clone(), inv).clone();
  const boot = (s) => {
    const d = P[s + "ToeBase"].subtract(P[s + "Foot"]);
    return { pitch: deg(Math.atan2(d.y, Math.hypot(d.x, d.z))), roll: deg(Math.atan2(d.x, d.z)) };
  };
  return { P, L: boot("Left"), R: boot("Right") };
}
/* bones compared relative to the pelvis (the foot IK lifts or lowers the pelvis a few cm on the spot) */
const dist = (a, b) =>
  Math.max(...NAMES.filter((n) => n !== "Hips").map((n) => {
    const d = core.Vector3.Distance(a.P[n].subtract(a.P.Hips), b.P[n].subtract(b.P.Hips));
    if (d > 0.03 && process.env.DEBUG) console.error(n, d.toFixed(3));
    return d;
  }));
const sideOf = (s, h) => s.P[h + "Hand"].subtract(s.P.Hips);
function frames(clip, speed, n, fn) {
  for (let i = 0; i < n; i++) {
    world.avatar.play(clip, speed, DT);
    scene.render();
    if (fn) fn(i);
  }
}

world.avatar.place(0, 0, 12.6, 0);

// ---- the first frame is the clip, not the bind pose
world.avatar.play("idle", 0, DT);
scene.render();
const first = read();
frames("idle", 0, 150);
const settled = read();
ok(dist(first, settled) < 0.05, `idle: the first frame is ${(dist(first, settled) * 100).toFixed(1)} cm from the settled pose (the bind pose shows while the clip fades in)`);

// ---- 10 s of idle
let prev = null;
let worstPop = 0;
const hands = { minZ: 9, minApart: 9, minOut: 9 };
const boots = { pitch: [99, -99], roll: 0 };
const ref = settled;
frames("idle", 0, 300, () => {
  const s = read();
  if (prev) worstPop = Math.max(worstPop, dist(prev, s));
  prev = s;
  for (const side of ["Left", "Right"]) {
    const h = sideOf(s, side);
    hands.minZ = Math.min(hands.minZ, h.z);
    hands.minOut = Math.min(hands.minOut, Math.abs(h.x));
    const b = side === "Left" ? s.L : s.R;
    boots.pitch = [Math.min(boots.pitch[0], b.pitch), Math.max(boots.pitch[1], b.pitch)];
    boots.roll = Math.max(boots.roll, Math.abs(b.roll));
  }
  hands.minApart = Math.min(hands.minApart, Math.abs(s.P.LeftHand.x - s.P.RightHand.x));
});
const result = { handMinZ: +hands.minZ.toFixed(3), handMinOut: +hands.minOut.toFixed(3), handsApart: +hands.minApart.toFixed(3), bootPitch: boots.pitch.map((v) => +v.toFixed(1)), bootRoll: +boots.roll.toFixed(1), worstPopCm: +(worstPop * 100).toFixed(2) };
ok(hands.minZ > 0.05, `idle: a hand is only ${hands.minZ.toFixed(2)} m in front of the hips (hands behind the back)`);
ok(hands.minOut > 0.22, `idle: a hand comes within ${hands.minOut.toFixed(2)} m of the body's midline`);
ok(hands.minApart > 0.5, `idle: the hands come within ${hands.minApart.toFixed(2)} m of each other`);
ok(boots.pitch[0] > -22 && boots.pitch[1] < -8, `idle: boot pitch ${boots.pitch.join(" .. ")} deg is not the flat stance (-22..-8)`);
ok(boots.roll < 6, `idle: a boot is turned ${boots.roll.toFixed(1)} deg off straight ahead (twisted)`);
ok(worstPop < 0.03, `idle: a bone jumps ${(worstPop * 100).toFixed(1)} cm between two frames`);

// ---- back to idle from everything else
for (const [clip, speed, n] of [["walk", 1.4, 45], ["run", 3, 30], ["jump", 0, 12], ["fall", 0, 20], ["float", 0, 30], ["cast", 0, 45], ["throw", 0, 30], ["lookup", 0, 60], ["windbolt", 0, 20], ["windrain", 0, 25], ["triumph", 0, 30], ["shelter", 0, 40]]) {
  frames(clip, speed, n);
  const inClip = skin.clip();
  frames("idle", 0, 60);
  const back = read();
  const gap = dist(back, ref);
  const h = Math.min(sideOf(back, "Left").z, sideOf(back, "Right").z);
  ok(inClip === clip, `"${clip}" played "${inClip}"`);
  ok(gap < 0.06, `after ${clip}: idle is ${(gap * 100).toFixed(1)} cm from the clean pose 2 s later`);
  ok(h > 0.05, `after ${clip}: a hand is ${h.toFixed(2)} m in front of the hips`);
  ok(Math.max(Math.abs(back.L.roll), Math.abs(back.R.roll)) < 6 && back.L.pitch < -8 && back.L.pitch > -22 && back.R.pitch < -8 && back.R.pitch > -22, `after ${clip}: boots are not flat and straight (${back.L.pitch.toFixed(0)}/${back.R.pitch.toFixed(0)} deg, roll ${back.L.roll.toFixed(0)}/${back.R.roll.toFixed(0)})`);
}

// ---- EVERY clip and EVERY power, then standing still (the real clip picker: his control state, the sky, the powers)
const { SKIN_CLIPS } = await import(new URL("js/small-weather.js", root).href);
const { POWER_POSE, powerPose } = await import(new URL("js/power-poses.js", root).href);
const { VERB_IDS } = await import(new URL("js/abilities.js", root).href);
const SEATED = new Set(["sit", "type", "window", "lie", "side", "recline"]); // the day's seats: he never stands from these under control
const fake = { speed: 0, grounded: true, mode: "control", vy: 0 };
const sky = { state: "clear", rain: 0 };
const castNow = { cast: null };
window.day = { control: { state: () => fake }, weather: { now: () => sky }, powers: { now: () => castNow } };
const ids = [...new Set([...Object.keys(POWER_POSE), ...VERB_IDS])];
const cases = [];
for (const c of SKIN_CLIPS) if (!SEATED.has(c)) for (const secs of [0.3, 3]) cases.push({ name: c, clip: c, secs });
for (const id of ids) cases.push({ name: `power ${id}`, clip: powerPose(id), secs: 1.2, id });
for (const k of cases) {
  for (const weather of ["clear", "wind"]) {
    sky.state = weather;
    sky.rain = 0;
    world.avatar.place(0, 0, 12.6, 0);
    for (let i = 0; i < 30; i++) { world.avatar.play("idle", 0, DT); scene.render(); }
    castNow.cast = k.id ? { power: k.id, age: 5 } : null;
    const speed = k.clip === "walk" ? 1.4 : k.clip === "run" ? 3 : 0;
    fake.grounded = !["jump", "fall", "float"].includes(k.clip);
    frames(k.clip, speed, Math.round(k.secs * 30));
    castNow.cast = null;
    fake.grounded = true;
    frames("idle", 0, 60); // the 2 s the clip gets to settle
    let worst = 0, handZ = 9, bootBad = "", prevS = null, pop = 0, fidget = 0;
    frames("idle", 0, 300, () => {
      const s = read();
      const c = skin.clip();
      if (c !== "idle") fidget++; // shelter in the rain, a look at a clear sky: his own idle variants, each tested on its own
      if (c === "idle") {
        worst = Math.max(worst, dist(s, ref));
        handZ = Math.min(handZ, sideOf(s, "Left").z, sideOf(s, "Right").z);
        for (const b of [s.L, s.R]) if (Math.abs(b.roll) > 6 || b.pitch > -8 || b.pitch < -22) bootBad = `${b.pitch.toFixed(0)} deg pitch, ${b.roll.toFixed(0)} roll`;
        if (prevS) pop = Math.max(pop, dist(prevS, s));
      }
      prevS = c === "idle" ? s : null;
    });
    const tag = `${k.name} x ${k.secs} s, ${weather} sky, then 10 s still`;
    ok(worst < 0.06, `${tag}: idle is ${(worst * 100).toFixed(1)} cm from the clean pose`);
    ok(handZ > 0.05, `${tag}: a hand is ${handZ.toFixed(2)} m in front of the hips`);
    ok(!bootBad, `${tag}: boots ${bootBad}`);
    ok(pop < 0.03, `${tag}: a bone jumps ${(pop * 100).toFixed(1)} cm between two frames`);
    /* sheltering in the rain and looking up are held for as long as he stands in that weather; a look at a clear sky is a
       few seconds long and goes back to idle (it never stays held). */
    if (weather === "clear") ok(fidget < 200, `${tag}: still not idle for ${(fidget / 30).toFixed(1)} s of the 10`);
  }
}
window.day = undefined;

if (failed) {
  console.error(`\n${failed} idle-pose check(s) failed`, JSON.stringify(result));
  process.exit(1);
}
console.log("idle-pose: all checks passed", JSON.stringify(result));
process.exit(0);
