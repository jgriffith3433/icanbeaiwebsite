/* ==========================================================================
   Small Weather's animation clips, as inputs for Hawkes Gen's mesh.rig
   (art/small-weather/hawkes.assets.json). Run: node scripts/small-weather-clips.mjs

   The source is a Mixamo rig the studio already has: PH Origins' ch33 hero
   (phoriginswebsite/assets/models/ch33-hero.glb, also in hawkes-assets), with
   Mixamo's Idle, Walk, Run, Jump and Sitting Idle. Those are written out in place
   (no hip travel: the game moves him). The rest are posed here on the same
   skeleton: fall, float, cast (both arms up), throw (a lightning throw), and the
   day's poses (type, phone, lie, side, recline).

   Every clip is a small GLB in art/small-weather/clips/: the body skeleton
   (mixamorig: names, no fingers), a one-triangle stand-in mesh, one animation.
   World space here is glTF's: y up, he faces +z, +x is his left.
   ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { skeletonFrom, sampleClip, blendPose, clonePose, fk, aim, turn, q, v3, writeClipGlb } from "./gltf-skeleton.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "..", "art", "small-weather", "clips");
// the PH Origins repo next to this one (or next to the worktree's parent folder), or a path as the first argument
const SOURCE =
  process.argv[2] ||
  [path.join(here, "..", "models", "small-weather.glb")]
    .concat(
      [path.join(here, "..", ".."), path.join(here, "..", "..", "..")].map((d) =>
        path.join(d, "phoriginswebsite", "assets", "models", "ch33-hero.glb")
      )
    )
    .find((f) => fs.existsSync(f));
const FPS = 30;
const OUT_MODELS = path.join(here, "..", "models", "clips");
const TAU = Math.PI * 2;
const X = [1, 0, 0];
const Y = [0, 1, 0];

const sk = skeletonFrom(SOURCE);
const STAND = 0.99; // hips height standing, metres

/* hips in world metres -> the skeleton's local hips translation */
function setHips(pose, pos) {
  pose.hips = v3.scale(q.rot(q.inv(sk.root.r), pos), 1 / sk.root.s);
}
function hipsWorld(pose) {
  return fk(sk, pose).P[0];
}
/* in place: no travel across the ground; y kept, or pinned (airborne clips) */
function inPlace(pose, y) {
  const w = hipsWorld(pose);
  setHips(pose, [0, y == null ? w[1] : y, 0]);
  return pose;
}
const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
/* both sides at once: dir is for his left; the right is mirrored (x flipped) */
function arms(p, upper, fore, upperR, foreR) {
  aim(sk, p, "LeftArm", "LeftForeArm", upper);
  aim(sk, p, "LeftForeArm", "LeftHand", fore);
  aim(sk, p, "RightArm", "RightForeArm", upperR || [-upper[0], upper[1], upper[2]]);
  aim(sk, p, "RightForeArm", "RightHand", foreR || [-fore[0], fore[1], fore[2]]);
}
function legs(p, thighL, shinL, thighR, shinR) {
  aim(sk, p, "LeftUpLeg", "LeftLeg", thighL);
  aim(sk, p, "LeftLeg", "LeftFoot", shinL);
  aim(sk, p, "RightUpLeg", "RightLeg", thighR || [-thighL[0], thighL[1], thighL[2]]);
  aim(sk, p, "RightLeg", "RightFoot", shinR || [-shinL[0], shinL[1], shinL[2]]);
}
function frames(seconds, fn) {
  const n = Math.max(2, Math.round(seconds * FPS) + 1);
  return Array.from({ length: n }, (_, k) => fn(k / (n - 1), (k / (n - 1)) * seconds));
}
const clipOf = (...names) => names.find((n) => sk.clips[n]);
const IDLE = clipOf("Idle", "idle");
const WALK = clipOf("Walk", "walk");
const RUN = clipOf("Run", "run");
const SIT = clipOf("SitIdle", "sit");
const JUMP = clipOf("Jump", "jump");
const idleAt = (t) => sampleClip(sk, IDLE, t % sk.clips[IDLE].duration);

const CLIPS = {
  /* Mixamo, in place */
  idle: () => frames(sk.clips[IDLE].duration, (u, t) => inPlace(sampleClip(sk, IDLE, t))),
  walk: () => frames(sk.clips[WALK].duration, (u, t) => inPlace(sampleClip(sk, WALK, t))),
  run: () => frames(sk.clips[RUN].duration, (u, t) => inPlace(sampleClip(sk, RUN, t))),
  sit: () => frames(sk.clips[SIT].duration, (u, t) => inPlace(sampleClip(sk, SIT, t))),

  /* Mixamo's Jump from the push-off to the top, knees tucking (the game lifts him) */
  jump: () =>
    frames(0.5, (u) => {
      const t = 0.72 + 0.33 * clamp01(u / 0.75);
      return inPlace(sampleClip(sk, JUMP, t), STAND);
    }),

  /* falling: arms up and waving for balance, legs pedalling; loops */
  fall: () =>
    frames(1.2, (u) => {
      const a = u * TAU;
      const p = blendPose(sampleClip(sk, JUMP, 1.15), idleAt(0), 0.35);
      turn(sk, p, "Spine1", X, -0.12);
      turn(sk, p, "Head", X, -0.2);
      arms(p, [0.75, 0.55 + 0.15 * Math.sin(a), 0.1 * Math.cos(a)], [0.45, 0.85, 0.25 * Math.sin(a)], [-0.75, 0.55 + 0.15 * Math.sin(a + 2), 0.1 * Math.cos(a + 2)], [-0.45, 0.85, 0.25 * Math.sin(a + 2)]);
      legs(p, [0.08, -1, 0.3 + 0.25 * Math.sin(a)], [0.02, -1, -0.25 + 0.2 * Math.sin(a)], [-0.08, -1, 0.3 - 0.25 * Math.sin(a)], [-0.02, -1, -0.25 - 0.2 * Math.sin(a)]);
      return inPlace(p, STAND);
    }),

  /* floating down slowly: arms spread wide like riding the wind, leaning into it; loops */
  float: () =>
    frames(3, (u) => {
      const a = u * TAU;
      const p = idleAt(0);
      turn(sk, p, "Spine", X, 0.12);
      turn(sk, p, "Head", X, -0.22);
      arms(p, [1, -0.12 + 0.06 * Math.sin(a), 0.05], [1, -0.02 + 0.1 * Math.sin(a + 0.7), 0.12]);
      legs(p, [0.04, -1, -0.1], [0.02, -1, -0.32 + 0.05 * Math.sin(a)], [-0.05, -1, 0.02], [-0.02, -1, -0.12 - 0.05 * Math.sin(a)]);
      return inPlace(p, STAND + 0.03 * Math.sin(a));
    }),

  /* calling the weather: both arms rise to the sky and hold, crackling */
  cast: () =>
    frames(1.6, (u, t) => {
      const k = ease(clamp01(t / 0.45));
      const up = clonePose(idleAt(t));
      turn(sk, up, "Spine2", X, -0.15);
      turn(sk, up, "Head", X, -0.35);
      const s = t > 0.45 ? 0.03 * Math.sin(t * 40) : 0;
      arms(up, [0.38, 1, 0.12 + s], [0.2, 1, 0.08 - s]);
      const p = blendPose(idleAt(t), up, k);
      const dip = Math.sin(clamp01(t / 0.45) * Math.PI) * 0.04;
      return inPlace(p, STAND - dip);
    }),

  /* a lightning throw: the right arm winds back over the shoulder, then whips forward */
  throw: () => {
    const base = idleAt(0);
    const wind = clonePose(base);
    turn(sk, wind, "Spine1", Y, -0.5);
    turn(sk, wind, "Spine", X, -0.06);
    arms(wind, [0.35, 0.15, 1], [0.2, 0.3, 1], [-0.65, 0.45, -0.6], [-0.15, 1, -0.35]);
    const fling = clonePose(base);
    turn(sk, fling, "Spine1", Y, 0.35);
    turn(sk, fling, "Spine", X, 0.15);
    arms(fling, [0.7, -0.4, -0.3], [0.5, -0.8, 0.1], [-0.15, 0.2, 1], [-0.05, 0.08, 1]);
    return frames(1.1, (u, t) => {
      let p;
      if (t < 0.35) p = blendPose(base, wind, ease(t / 0.35));
      else if (t < 0.52) p = blendPose(wind, fling, ease((t - 0.35) / 0.17));
      else if (t < 0.7) p = fling;
      else p = blendPose(fling, base, ease((t - 0.7) / 0.4));
      return inPlace(clonePose(p), STAND - (t > 0.35 && t < 0.8 ? 0.04 : 0));
    });
  },

  /* the day's poses (the world tilts and seats him; these are the limbs) */
  type: () =>
    frames(2, (u, t) => {
      const a = u * TAU;
      const p = sampleClip(sk, SIT, 0);
      turn(sk, p, "Head", X, 0.15);
      arms(p, [0.25, -0.7, 0.6], [0.12, -0.08 + 0.04 * Math.sin(a * 6), 1], [-0.25, -0.7, 0.6], [-0.12, -0.08 + 0.04 * Math.sin(a * 6 + 1.3), 1]);
      return inPlace(p);
    }),
  phone: () =>
    frames(4, (u, t) => {
      const p = idleAt(t);
      turn(sk, p, "Head", X, 0.38);
      arms(p, [0.25, -0.85, 0.35], [-0.35, 0.55, 0.75], [-0.25, -0.85, 0.35], [0.2, 0.5, 0.85]);
      return inPlace(p);
    }),
  lie: () =>
    frames(4, (u) => {
      const p = idleAt(0);
      turn(sk, p, "Spine2", X, -0.03 * Math.sin(u * TAU));
      arms(p, [0.15, -1, 0], [0.1, -1, 0.06]);
      legs(p, [0.05, -1, 0], [0.04, -1, -0.03]);
      return inPlace(p, STAND);
    }),
  side: () =>
    frames(4, (u) => {
      const p = idleAt(0);
      turn(sk, p, "Spine1", X, 0.1 + 0.02 * Math.sin(u * TAU));
      arms(p, [0.12, -0.55, 0.8], [0.05, 0.3, 1]);
      legs(p, [0.05, -Math.cos(0.55), Math.sin(0.55)], [0.04, -0.92, -0.39], [-0.05, -Math.cos(0.6), Math.sin(0.6)], [-0.04, -0.9, -0.42]);
      return inPlace(p, STAND);
    }),
  recline: () =>
    frames(4, (u) => {
      const p = idleAt(0);
      turn(sk, p, "Spine2", X, -0.03 * Math.sin(u * TAU));
      arms(p, [0.18, -0.8, 0.4], [0.05, -0.2, 1]);
      legs(p, [0.08, -Math.cos(0.6), Math.sin(0.6)], [0.06, -Math.cos(0.52), Math.sin(0.52)]);
      return inPlace(p, STAND);
    }),

  /* AAA hero beats: look up at a clear sky (idle under fair weather) */
  lookup: () =>
    frames(3.2, (u, t) => {
      const k = ease(clamp01(t / 0.7));
      const hold = t > 2.2 ? ease(clamp01((t - 2.2) / 1.0)) : 0;
      const up = clonePose(idleAt(t));
      turn(sk, up, "Spine2", X, -0.28);
      turn(sk, up, "Spine1", X, -0.12);
      turn(sk, up, "Head", X, -0.55);
      arms(up, [0.2, -0.55, 0.15], [0.12, -0.9, 0.05], [-0.22, -0.5, 0.12], [-0.1, -0.85, 0.08]);
      const p = blendPose(idleAt(t), up, k * (1 - hold));
      return inPlace(p, STAND);
    }),

  /* Lightning wind-up: right hand gathers over the shoulder, left steadies, eyes on the aim */
  windbolt: () =>
    frames(1.0, (u, t) => {
      const k = ease(clamp01(t / 0.35));
      const base = idleAt(0);
      const wind = clonePose(base);
      turn(sk, wind, "Spine1", Y, -0.55);
      turn(sk, wind, "Spine2", X, -0.18);
      turn(sk, wind, "Head", X, -0.2);
      turn(sk, wind, "Head", Y, 0.25);
      arms(wind, [0.45, 0.05, 0.85], [0.25, 0.35, 0.95], [-0.15, 0.95, 0.05], [-0.05, 1.0, -0.15]);
      legs(wind, [0.12, -1, 0.15], [0.04, -1, -0.2], [-0.18, -1, -0.05], [-0.06, -1, -0.28]);
      const p = blendPose(base, wind, k);
      const dip = 0.03 * Math.sin(clamp01(t / 0.35) * Math.PI);
      return inPlace(p, STAND - dip);
    }),

  /* Rain / Fog wind-up: both palms open upward, a soft gather, chest lifts */
  windrain: () =>
    frames(1.1, (u, t) => {
      const k = ease(clamp01(t / 0.4));
      const base = idleAt(t * 0.3);
      const rain = clonePose(base);
      turn(sk, rain, "Spine2", X, -0.22);
      turn(sk, rain, "Head", X, -0.3);
      arms(rain, [0.55, 0.75, 0.35], [0.35, 0.95, 0.15], [-0.55, 0.75, 0.35], [-0.35, 0.95, 0.15]);
      const p = blendPose(base, rain, k);
      return inPlace(p, STAND - 0.02 * k);
    }),

  /* Triumphant fist after a big cast (Storm / Tornado) */
  triumph: () =>
    frames(1.4, (u, t) => {
      const base = idleAt(0);
      const up = clonePose(base);
      turn(sk, up, "Spine1", Y, 0.2);
      turn(sk, up, "Spine2", X, -0.25);
      turn(sk, up, "Head", X, -0.15);
      arms(up, [0.25, -0.4, 0.2], [0.15, -0.7, 0.1], [-0.2, 1.05, 0.1], [-0.08, 1.0, -0.05]);
      let p;
      if (t < 0.25) p = blendPose(base, up, ease(t / 0.25));
      else if (t < 0.85) p = up;
      else p = blendPose(up, base, ease((t - 0.85) / 0.55));
      return inPlace(clonePose(p), STAND - (t > 0.2 && t < 0.9 ? 0.03 : 0));
    }),

  /* Rain-shelter shrug: shoulders up, head tucked, a wet-weather idle */
  shelter: () =>
    frames(2.4, (u, t) => {
      const a = u * TAU;
      const p = idleAt(t);
      turn(sk, p, "Spine2", X, 0.18);
      turn(sk, p, "Head", X, 0.35);
      arms(p, [0.35, -0.35 + 0.04 * Math.sin(a), 0.55], [0.2, 0.15, 0.85], [-0.35, -0.35 + 0.04 * Math.sin(a + 1), 0.55], [-0.2, 0.15, 0.85]);
      return inPlace(p, STAND + 0.01 * Math.sin(a));
    }),

  /* Sit-at-the-window idle for autopilot evenings: perched, looking out */
  window: () => {
    const sitName = SIT || "idle";
    const dur = sk.clips[sitName].duration || 2;
    return frames(4, (u, t) => {
      const a = u * TAU;
      const p = sampleClip(sk, sitName, t % dur);
      turn(sk, p, "Spine1", Y, 0.35 + 0.04 * Math.sin(a * 0.5));
      turn(sk, p, "Head", X, -0.1);
      turn(sk, p, "Head", Y, 0.45);
      arms(p, [0.3, -0.55, 0.55], [0.15, -0.2, 0.9], [-0.4, -0.75, 0.2], [-0.15, 0.35, 0.75]);
      return inPlace(p);
    });
  },
};

/* Posed clips that ship as separate files next to the model: the hero beats, plus cast, throw, fall and float, which
   the model's own baked copies replace (js/small-weather.js drops a baked group when its extra loads). */
const HERO = new Set(["lookup", "windbolt", "windrain", "triumph", "shelter", "window", "cast", "throw", "fall", "float"]);
/* Mixamo-sourced: when the source is already models/small-weather.glb these are its own baked clips, so re-writing
   them would only copy them onto themselves (and the jump window below assumes Mixamo's 2 s Jump). */
const FROM_MODEL = path.resolve(SOURCE) === path.resolve(here, "..", "models", "small-weather.glb");
const BASE = new Set(["idle", "walk", "run", "sit", "jump"]);
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(OUT_MODELS, { recursive: true });
const only = process.argv.slice(3);
for (const [name, make] of Object.entries(CLIPS)) {
  if (only.length && !only.includes(name)) continue;
  if (!only.length && FROM_MODEL && BASE.has(name)) continue;
  const f = make();
  const file = path.join(OUT, `${name}.glb`);
  writeClipGlb(file, sk, name, f, FPS);
  if (HERO.has(name)) {
    fs.copyFileSync(file, path.join(OUT_MODELS, `${name}.glb`));
  }
  console.log(`${name}: ${f.length} frames, ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}
