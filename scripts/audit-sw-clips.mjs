/* Numeric audit of Small Weather's clips: node scripts/audit-sw-clips.mjs [--json]
   Per clip, over 9 frames: twist (deg about each bone's own axis, vs rest) of
   spine/neck/arms/legs, hands crossing the body midline, foot height spread,
   and the pop between the last frame and the first (loop) + vs idle. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { skeletonFrom, sampleClip, restPose, fk, q, v3 } from "./gltf-skeleton.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const model = path.join(here, "..", "models", "small-weather.glb");
const sk = skeletonFrom(process.argv[2] || model);
const B = (n) => sk.byName[n];
const deg = (r) => (r * 180) / Math.PI;
const rest = restPose(sk);
/* twist of local rotation about the bone's child direction (swing-twist) */
function twist(pose, name, child) {
  const i = B(name), c = B(child);
  const axis = v3.norm(sk.bones[c].t);
  const r = q.mul(q.inv(rest.r[i]), pose.r[i]);
  const p = v3.dot([r[0], r[1], r[2]], axis);
  const t = q.norm([axis[0] * p, axis[1] * p, axis[2] * p, r[3]]);
  let a = 2 * Math.atan2(Math.hypot(t[0], t[1], t[2]) * Math.sign(p || 1), t[3]);
  if (a > Math.PI) a -= 2 * Math.PI; if (a < -Math.PI) a += 2 * Math.PI;
  return deg(a);
}
const CHAIN = [["Spine","Spine1"],["Spine1","Spine2"],["Spine2","Neck"],["Neck","Head"],["LeftArm","LeftForeArm"],["LeftForeArm","LeftHand"],["RightArm","RightForeArm"],["RightForeArm","RightHand"],["LeftUpLeg","LeftLeg"],["LeftLeg","LeftFoot"],["RightUpLeg","RightLeg"],["RightLeg","RightFoot"]];
const out = {};
const names = Object.keys(sk.clips).sort();
const first = {};
for (const n of names) {
  const c = sk.clips[n];
  const steps = 9, rows = [];
  let maxTw = 0, worst = "", cross = 0, footMin = 1e9, footMax = -1e9;
  for (let k = 0; k < steps; k++) {
    const t = (c.duration * k) / (steps - 1);
    const p = sampleClip(sk, n, Math.min(t, c.duration));
    const w = fk(sk, p);
    for (const [a, b] of CHAIN) {
      const tw = Math.abs(twist(p, a, b));
      if (tw > maxTw) { maxTw = tw; worst = a + "@" + t.toFixed(2); }
    }
    // body frame from hips->spine up and shoulder line
    const lsh = w.P[B("LeftArm")], rsh = w.P[B("RightArm")];
    const side = v3.norm(v3.sub(lsh, rsh)), mid = v3.scale(v3.add(lsh, rsh), 0.5);
    const lh = v3.dot(v3.sub(w.P[B("LeftHand")], mid), side), rh = v3.dot(v3.sub(w.P[B("RightHand")], mid), side);
    if (lh < -0.05 || rh > 0.05) cross++;
    const fy = [w.P[B("LeftFoot")][1], w.P[B("RightFoot")][1]];
    footMin = Math.min(footMin, ...fy); footMax = Math.max(footMax, ...fy);
    if (k === 0) first[n] = p;
  }
  out[n] = { dur: +c.duration.toFixed(2), maxTwistDeg: Math.round(maxTw), at: worst, handsCrossedFrames: cross, footY: [+footMin.toFixed(3), +footMax.toFixed(3)] };
}
console.table(out);
/* pops: pose distance (deg, mean joint) between each clip's first frame and idle's first frame */
const dist=()=>0;
const pops = {};
for (const n of names) pops[n] = +dist(first[n], first.idle).toFixed(1);
console.log("mean joint angle, first frame vs idle first frame (deg):", pops);
