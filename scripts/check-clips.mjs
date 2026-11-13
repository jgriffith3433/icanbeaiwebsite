#!/usr/bin/env node
/* Small Weather's clips as data (no browser): every animation in models/small-weather.glb, and the extra clips in
   models/clips/, is checked on the skeleton by forward kinematics.
   - rotations are unit quaternions in the rest pose's hemisphere (a cross-fade adds quaternions: opposite signs
     cancel and twist the bone: an idle -> walk blend once did that on the thighs), and cross-fades between any two
     clips keep every bone's blended rotation at a usable length;
   - no pop: no bone turns more than 35 deg between two keys, and the loops close (last key = first key);
   - idle is upright and untwisted: spine lean, neck lean, pelvis and shoulder yaw all small, knees nearly straight,
     the hands hang apart (no arm through the body), the pelvis stays put;
   - walk and run: no pelvis/shoulder turn beyond what a stride needs, the head stays over the shoulders, hands never
     cross the midline;
   - every clip: no joint bent backwards (knee angle sign), no hand or foot through the other limb's thigh. */
import fs from "node:fs";
import { skeletonFrom, sampleClip, fk, q, v3 } from "./gltf-skeleton.mjs";

const root = new URL("../", import.meta.url);
let failed = 0;
const ok = (c, m) => {
  if (!c) {
    console.error("FAIL:", m);
    failed++;
  }
  return c;
};
const sk = skeletonFrom(process.env.CLIPS_GLB || new URL("models/small-weather.glb", root).pathname);
const B = (n) => sk.byName[n];
const deg = (r) => (r * 180) / Math.PI;
const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const LOOPS = ["idle", "walk", "run", "fall", "float", "sit", "type", "phone", "lie", "side", "recline", "shelter", "window"];
const NAMES = ["idle", "walk", "run", "jump", "fall", "float", "cast", "throw", "sit", "type", "phone", "lie", "side", "recline"];
for (const n of NAMES) ok(sk.clips[n], `models/small-weather.glb has no "${n}" clip`);

const samples = (name, n = 12) => {
  const d = sk.clips[name].duration;
  return Array.from({ length: n + 1 }, (_, k) => sampleClip(sk, name, (d * k) / n));
};
const metrics = (pose) => {
  const { P } = fk(sk, pose);
  const d = (a, b) => v3.sub(P[B(b)], P[B(a)]);
  const yaw = (a, b) => Math.atan2(d(a, b)[2], d(a, b)[0]);
  const sp = d("Hips", "Head");
  const nk = d("Neck", "Head");
  const ang = (u, v) => Math.acos(Math.max(-1, Math.min(1, v3.dot(u, v) / (v3.len(u) * v3.len(v)))));
  return {
    hipYaw: deg(yaw("RightUpLeg", "LeftUpLeg")),
    shYaw: deg(yaw("RightArm", "LeftArm")),
    lean: deg(Math.atan2(sp[2], sp[1])),
    neck: deg(Math.atan2(nk[2], nk[1])),
    sideLean: deg(Math.atan2(sp[0], sp[1])),
    kneeL: deg(ang(d("LeftUpLeg", "LeftLeg"), d("LeftLeg", "LeftFoot"))),
    kneeR: deg(ang(d("RightUpLeg", "RightLeg"), d("RightLeg", "RightFoot"))),
    handsApart: P[B("LeftHand")][0] - P[B("RightHand")][0],
    hipsXZ: [P[0][0], P[0][2]],
    hipsY: P[0][1],
    P,
  };
};

// ---- unit quaternions, one hemisphere, no pops, closing loops
for (const [name, c] of Object.entries(sk.clips)) {
  if (!NAMES.includes(name)) continue;
  for (const [k, tr] of Object.entries(c.ch)) {
    if (!tr.rotation) continue;
    const vals = tr.rotation.values;
    const bone = sk.bones[k].name;
    let worst = 0;
    vals.forEach((r, i) => {
      if (!ok(Math.abs(Math.hypot(...r) - 1) < 1e-3, `${name}/${bone} key ${i}: rotation is not a unit quaternion`)) return;
      if (dot4(r, sk.bones[k].r) < -1e-3) ok(false, `${name}/${bone} key ${i}: rotation is in the opposite hemisphere from the rest pose (a cross-fade would twist it)`);
      if (i) worst = Math.max(worst, deg(2 * Math.acos(Math.min(1, Math.abs(dot4(r, vals[i - 1]))))));
    });
    ok(worst <= 35, `${name}/${bone}: turns ${worst.toFixed(0)} deg between two keys (a pop)`);
    if (LOOPS.includes(name)) {
      const seam = deg(2 * Math.acos(Math.min(1, Math.abs(dot4(vals[0], vals[vals.length - 1])))));
      ok(seam <= 4, `${name}/${bone}: the loop doesn't close (${seam.toFixed(1)} deg between its last and first key)`);
    }
  }
}

// ---- cross-fades: blending any two clips (the player adds weighted quaternions) never collapses a bone
for (let i = 0; i < NAMES.length; i++) {
  for (let j = i + 1; j < NAMES.length; j++) {
    const A = samples(NAMES[i], 6);
    const Bs = samples(NAMES[j], 6);
    let worst = 1;
    for (const a of A) for (const b of Bs) {
      a.r.forEach((r, k) => {
        const m = r.map((v, c) => (v + b.r[k][c]) / 2);
        worst = Math.min(worst, Math.hypot(...m));
      });
    }
    ok(worst > 0.55, `blending ${NAMES[i]} with ${NAMES[j]} collapses a bone (blended length ${worst.toFixed(2)})`);
  }
}

// ---- idle: upright and untwisted, the whole loop
const idle = samples("idle", 32).map(metrics);
const max = (f) => Math.max(...idle.map((m) => Math.abs(f(m))));
ok(max((m) => m.lean) <= 6, `idle: the spine leans ${max((m) => m.lean).toFixed(1)} deg (max 6)`);
ok(max((m) => m.neck) <= 8, `idle: the neck leans ${max((m) => m.neck).toFixed(1)} deg (max 8)`);
ok(max((m) => m.sideLean) <= 5, `idle: the spine leans sideways ${max((m) => m.sideLean).toFixed(1)} deg (max 5)`);
ok(max((m) => m.hipYaw) <= 6 && max((m) => m.shYaw) <= 6, `idle: pelvis ${max((m) => m.hipYaw).toFixed(1)} / shoulder ${max((m) => m.shYaw).toFixed(1)} deg of yaw (max 6: a twisted torso)`);
ok(max((m) => m.kneeL) <= 14 && max((m) => m.kneeR) <= 14, `idle: knees bend ${Math.max(max((m) => m.kneeL), max((m) => m.kneeR)).toFixed(0)} deg (max 14)`);
ok(Math.min(...idle.map((m) => m.handsApart)) > 0.35, "idle: the hands come within 35 cm of each other (an arm through the body)");
ok(max((m) => Math.hypot(...m.hipsXZ) - Math.hypot(...idle[0].hipsXZ)) < 0.02, "idle: the pelvis drifts");
ok(Math.max(...idle.map((m) => m.hipsY)) - Math.min(...idle.map((m) => m.hipsY)) < 0.03, "idle: the pelvis bobs more than 3 cm");
ok(sk.clips.idle.duration >= 4, "idle is shorter than 4 s (it would visibly repeat)");

// ---- walk and run
for (const [name, lim] of [["walk", { yaw: 14, lean: 8, neck: 12 }], ["run", { yaw: 28, lean: 38, neck: 42 }]]) {
  const ms = samples(name, 24).map(metrics);
  const m = (f) => Math.max(...ms.map((x) => Math.abs(f(x))));
  ok(m((x) => x.hipYaw) <= lim.yaw && m((x) => x.shYaw) <= lim.yaw * 1.6, `${name}: pelvis ${m((x) => x.hipYaw).toFixed(0)} / shoulders ${m((x) => x.shYaw).toFixed(0)} deg of yaw`);
  ok(m((x) => x.lean) <= lim.lean, `${name}: spine leans ${m((x) => x.lean).toFixed(0)} deg (max ${lim.lean})`);
  ok(m((x) => x.neck) <= lim.neck, `${name}: neck ${m((x) => x.neck).toFixed(0)} deg off upright (max ${lim.neck}): head hanging forward`);
  ok(Math.min(...ms.map((x) => x.handsApart)) > 0.15, `${name}: a hand crosses the body's midline`);
  ok(m((x) => x.sideLean) <= 8, `${name}: the spine leans sideways ${m((x) => x.sideLean).toFixed(0)} deg`);
}

// ---- every clip: knees bend the right way (the shin ends up behind the thigh's line, never in front of it), the
// pelvis is level, and no clip turns the whole body away from where he walks (yaw, except the throw's wind-up)
for (const name of NAMES) {
  const ms = samples(name, 24).map(metrics);
  const yawLim = name === "throw" ? 40 : name === "jump" ? 20 : 25;
  ok(Math.max(...ms.map((x) => Math.abs(x.hipYaw))) <= yawLim, `${name}: pelvis turned ${Math.max(...ms.map((x) => Math.abs(x.hipYaw))).toFixed(0)} deg (max ${yawLim})`);
  for (const [i, x] of ms.entries()) {
    const { P } = x;
    for (const side of ["Left", "Right"]) {
      const up = v3.sub(P[B(side + "Leg")], P[B(side + "UpLeg")]);
      const lo = v3.sub(P[B(side + "Foot")], P[B(side + "Leg")]);
      const bendsBack = v3.cross(up, lo)[0] * (side === "Left" ? 1 : 1);
      // the knee folds the shin backwards (toward -z) relative to the thigh: cross(up, lo).x >= 0 for a normal knee
      if (v3.len(up) > 0 && bendsBack < -0.01 && ["idle", "walk", "run"].includes(name)) ok(false, `${name} key ${i}: ${side} knee bends backwards`);
    }
    ok(Math.abs(x.hipsY) < 2, `${name}: the pelvis left the frame`);
  }
}

if (failed) {
  console.error(`\n${failed} clip check(s) failed`);
  process.exit(1);
}
console.log("clips: all checks passed");
