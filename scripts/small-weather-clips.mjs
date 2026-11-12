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
import { skeletonFrom, restPose, sampleClip, blendPose, clonePose, fk, aim, turn, q, v3, writeClipGlb } from "./gltf-skeleton.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
/* The target is his own rigged model (its rest pose is what every clip must be written against); the Mixamo clips
   (walk, run, jump, sit) come from the raw ch33 clip files kept in art/small-weather/clips (Gen's rig inputs, never
   rewritten here). Output: models/clips/<name>.glb, then scripts/embed-clips.mjs puts them into models/small-weather.glb. */
const DEST = path.join(here, "..", "models", "small-weather.glb");
const SRC_DIR = path.join(here, "..", "art", "small-weather", "clips");
const OUT_MODELS = path.join(here, "..", "models", "clips"); // the six hero beats the page loads on top of the model
const OUT_BODY = path.join(here, "..", "art", "small-weather", "model-clips"); // every clip on his rest pose: scripts/embed-clips.mjs puts them in the GLB
const HERO = new Set(["lookup", "windbolt", "windrain", "triumph", "shelter", "window", "cast", "throw", "fall", "float"]);
const FPS = 30;
const TAU = Math.PI * 2;
const X = [1, 0, 0];
const Y = [0, 1, 0];
const Z = [0, 0, 1];

const sk = skeletonFrom(DEST);
const REST = restPose(sk);
const STAND = fk(sk, REST).P[0][1]; // his hips height standing, metres (his own rig, not the Mixamo one)

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
/* ---- Mixamo clips retargeted by direction ------------------------------------------------------------------
   The Mixamo clips were once copied bone by bone onto his rig. His rig's rest rotations differ from ch33's (pelvis,
   spine, neck, arms), so every copied rotation landed offset: pelvis tipped back ~10 deg, neck ~28 deg forward, knees
   bent, the jump turned ~30 deg. Now each bone is aimed where the source's bone points in that frame (swing only, so
   no limb is ever twisted about its own length), plus the pelvis and shoulder yaw so the body still turns. */
const srcSkels = {};
const source = (name) => srcSkels[name] || (srcSkels[name] = skeletonFrom(path.join(SRC_DIR, name + ".glb")));
const AIM_CHAIN = [
  ["Hips", "Spine"], ["Spine", "Spine1"], ["Spine1", "Spine2"], ["Spine2", "Neck"], ["Neck", "Head"], ["Head", "HeadTop_End"],
  ["LeftShoulder", "LeftArm"], ["LeftArm", "LeftForeArm"], ["LeftForeArm", "LeftHand"],
  ["RightShoulder", "RightArm"], ["RightArm", "RightForeArm"], ["RightForeArm", "RightHand"],
  ["LeftUpLeg", "LeftLeg"], ["LeftLeg", "LeftFoot"], ["LeftFoot", "LeftToeBase"], ["LeftToeBase", "LeftToe_End"],
  ["RightUpLeg", "RightLeg"], ["RightLeg", "RightFoot"], ["RightFoot", "RightToeBase"], ["RightToeBase", "RightToe_End"],
];
const yawOf = (P, a, b) => {
  const d = v3.sub(P[sk.byName[b]], P[sk.byName[a]]);
  return Math.atan2(d[2], d[0]);
};
const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
function retarget(name, t) {
  const src = source(name);
  const clipName = Object.keys(src.clips)[0];
  const S = fk(src, sampleClip(src, clipName, t)).P;
  const sRest = fk(src, restPose(src)).P;
  const sp = (n) => S[src.byName[n]];
  const dir = (a, b) => v3.sub(sp(b), sp(a));
  const yawSrc = (a, b) => Math.atan2(sp(b)[2] - sp(a)[2], sp(b)[0] - sp(a)[0]);
  /* The spine, neck and head are moved by how far the source's bone swings from ITS rest, applied to his own rest
     (ch33's neck leans forward 16 deg at rest, his stands upright: copying the absolute direction would hang his head
     forward in every clip). Arms and legs take the source's absolute direction (T-pose vs A-pose, both straight legs). */
  const TORSO = new Set(["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head"]);
  const dRest = fk(sk, REST).P;
  const torsoDir = (bone, child) => {
    if (!TORSO.has(bone)) return dir(bone, child);
    const sr = v3.sub(sRest[src.byName[child]], sRest[src.byName[bone]]);
    const dr = v3.sub(dRest[sk.byName[child]], dRest[sk.byName[bone]]);
    return q.rot(q.fromTo(sr, dir(bone, child)), dr);
  };
  const p = clonePose(REST);
  for (const [bone, child] of AIM_CHAIN) {
    if (bone === "Hips" || bone === "Spine2") {
      // aim, then turn about the vertical so the hip line / shoulder line yaw match the source
      aim(sk, p, bone, child, torsoDir(bone, child));
      const [la, lb] = bone === "Hips" ? ["RightUpLeg", "LeftUpLeg"] : ["RightArm", "LeftArm"];
      const dd = wrap(yawOf(fk(sk, p).P, la, lb) - yawSrc(la, lb));
      turn(sk, p, bone, Y, dd);
      continue;
    }
    aim(sk, p, bone, child, torsoDir(bone, child));
  }
  const ratio = fk(sk, REST).P[0][1] / sRest[src.byName.Hips][1];
  return { pose: p, hipsY: sp("Hips")[1] * ratio };
}
const mixamo = (name, seconds, y) =>
  frames(seconds, (u, t) => {
    const { pose, hipsY } = retarget(name, t % source(name).clips[Object.keys(source(name).clips)[0]].duration);
    return inPlace(pose, y == null ? hipsY : y);
  });
const mixamoAt = (name, t) => retarget(name, t).pose;
const dur = (name) => source(name).clips[Object.keys(source(name).clips)[0]].duration;
const jumpAt = (t) => mixamoAt("jump", t);

/* ---- his idle: upright, relaxed, a slow breath and a small weight shift -----------------------------------------
   Written on his own rest pose (never copied from a mocap), so nothing is tipped, twisted or crossed: the spine and
   neck stay upright, the arms hang with a soft bend, and the only motion is breath (4 s), a weight shift and a slow
   look (8 s): the loop is 8 s and seamless. */
const IDLE_SECONDS = 8;
function idleAt(t) {
  const p = clonePose(REST);
  const b = (t / 4) * TAU;
  const s = (t / IDLE_SECONDS) * TAU;
  const breath = Math.sin(b);
  turn(sk, p, "Spine", X, 0.008 * breath);
  turn(sk, p, "Spine1", X, 0.012 * Math.sin(b - 0.3));
  turn(sk, p, "Spine2", X, 0.016 * Math.sin(b - 0.6));
  turn(sk, p, "Spine2", Z, -0.012 * Math.sin(s)); // the chest answers the hips' weight shift
  turn(sk, p, "Hips", Z, 0.012 * Math.sin(s));
  turn(sk, p, "Neck", X, -0.012 * Math.sin(b - 0.9));
  turn(sk, p, "Head", Y, 0.07 * Math.sin(s + 0.8));
  const sway = 0.012 * Math.sin(b - 0.5);
  arms(p, [0.17, -0.98, 0.02 + sway], [0.13, -0.95, 0.24 + sway]);
  return inPlace(p, STAND - 0.003 * (1 - breath) / 2);
}
/* a levelled head for the Mixamo clips: the neck's lean is what the retarget leaves (kept to the stride's own) */

const CLIPS = {
  idle: () => frames(IDLE_SECONDS, (u, t) => idleAt(t)),
  walk: () => mixamo("walk", dur("walk")),
  run: () => mixamo("run", dur("run")),
  sit: () => mixamo("sit", dur("sit")),

  /* the Jump from the push-off to the top, knees tucking (the game lifts him) */
  jump: () =>
    frames(0.5, (u) => {
      // the source jump turns the whole body ~30 deg at take-off: level the pelvis, and settle neck and chest toward upright
      const p = mixamoAt("jump", u * dur("jump"));
      const yaw = wrap(yawOf(fk(sk, p).P, "RightUpLeg", "LeftUpLeg"));
      turn(sk, p, "Hips", Y, yaw);
      return inPlace(blendPose(p, idleAt(0), 0.25), STAND);
    }),

  /* falling: arms up and waving for balance, legs pedalling; loops */
  fall: () =>
    frames(1.2, (u) => {
      const a = u * TAU;
      const p = blendPose(jumpAt(dur("jump")), idleAt(0), 0.6);
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
      const p = mixamoAt("sit", 0);
      turn(sk, p, "Head", X, 0.15);
      arms(p, [0.25, -0.7, 0.6], [0.12, -0.08 + 0.04 * Math.sin(a * 6), 1], [-0.25, -0.7, 0.6], [-0.12, -0.08 + 0.04 * Math.sin(a * 6 + 1.3), 1]);
      return inPlace(p);
    }),
  phone: () =>
    frames(IDLE_SECONDS, (u, t) => {
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
      const p = idleAt(0);
      turn(sk, p, "Spine2", X, 0.18 + 0.015 * Math.sin(a));
      turn(sk, p, "Spine1", Z, 0.012 * Math.sin(a + 1));
      turn(sk, p, "Head", X, 0.35);
      arms(p, [0.35, -0.35 + 0.04 * Math.sin(a), 0.55], [0.2, 0.15, 0.85], [-0.35, -0.35 + 0.04 * Math.sin(a + 1), 0.55], [-0.2, 0.15, 0.85]);
      return inPlace(p, STAND + 0.01 * Math.sin(a));
    }),

  /* Sit-at-the-window idle for autopilot evenings: perched, looking out */
  window: () => {
    const sitDur = dur("sit") || 2;
    return frames(4, (u, t) => {
      const a = u * TAU;
      const p = mixamoAt("sit", t % sitDur);
      turn(sk, p, "Spine1", Y, 0.35 + 0.04 * Math.sin(a * 0.5));
      turn(sk, p, "Head", X, -0.1);
      turn(sk, p, "Head", Y, 0.45);
      arms(p, [0.3, -0.55, 0.55], [0.15, -0.2, 0.9], [-0.4, -0.75, 0.2], [-0.15, 0.35, 0.75]);
      return inPlace(p);
    });
  },
};

fs.mkdirSync(OUT_MODELS, { recursive: true });
fs.mkdirSync(OUT_BODY, { recursive: true });
const only = process.argv.slice(2);
for (const [name, make] of Object.entries(CLIPS)) {
  if (only.length && !only.includes(name)) continue;
  const f = make();
  const file = path.join(OUT_BODY, `${name}.glb`);
  writeClipGlb(file, sk, name, f, FPS);
  if (HERO.has(name)) fs.copyFileSync(file, path.join(OUT_MODELS, `${name}.glb`));
  console.log(`${name}: ${f.length} frames, ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}
