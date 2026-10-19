/* ==========================================================================
   A tiny glTF skeleton toolkit for scripts/small-weather-clips.mjs: read a GLB,
   sample its Mixamo clips, pose bones by direction (forward kinematics), and
   write a clip GLB (skeleton + one animation) that Hawkes Gen's mesh.rig reads.
   No dependencies; quaternions are [x, y, z, w] like glTF.
   ========================================================================== */
import fs from "node:fs";

export const q = {
  mul: (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ],
  inv: (a) => [-a[0], -a[1], -a[2], a[3]],
  norm: (a) => {
    const l = Math.hypot(...a) || 1;
    return a.map((v) => v / l);
  },
  axis: (ax, ang) => {
    const n = v3.norm(ax);
    const s = Math.sin(ang / 2);
    return [n[0] * s, n[1] * s, n[2] * s, Math.cos(ang / 2)];
  },
  rot: (a, v) => {
    const p = q.mul(q.mul(a, [v[0], v[1], v[2], 0]), q.inv(a));
    return [p[0], p[1], p[2]];
  },
  slerp: (a, b, t) => {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    if (d < 0) {
      b = b.map((v) => -v);
      d = -d;
    }
    if (d > 0.9995) return q.norm(a.map((v, i) => v + (b[i] - v) * t));
    const th = Math.acos(d);
    const s = Math.sin(th);
    const wa = Math.sin((1 - t) * th) / s;
    const wb = Math.sin(t * th) / s;
    return a.map((v, i) => v * wa + b[i] * wb);
  },
  /* the shortest rotation taking direction a to direction b */
  fromTo: (a, b) => {
    a = v3.norm(a);
    b = v3.norm(b);
    const d = v3.dot(a, b);
    if (d < -0.99999) {
      let ax = v3.cross([1, 0, 0], a);
      if (v3.len(ax) < 1e-4) ax = v3.cross([0, 1, 0], a);
      return q.axis(ax, Math.PI);
    }
    const c = v3.cross(a, b);
    return q.norm([c[0], c[1], c[2], 1 + d]);
  },
};
export const v3 = {
  add: (a, b) => a.map((v, i) => v + b[i]),
  sub: (a, b) => a.map((v, i) => v - b[i]),
  scale: (a, s) => a.map((v) => v * s),
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(...a),
  norm: (a) => {
    const l = Math.hypot(...a) || 1;
    return a.map((v) => v / l);
  },
  lerp: (a, b, t) => a.map((v, i) => v + (b[i] - v) * t),
};

export function readGlb(file) {
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
  const binStart = 20 + jsonLen + 8;
  const accessor = (i) => {
    const a = json.accessors[i];
    const bv = json.bufferViews[a.bufferView];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
    const stride = bv.byteStride || n * 4;
    const off = binStart + (bv.byteOffset || 0) + (a.byteOffset || 0);
    const out = [];
    for (let k = 0; k < a.count; k++) {
      const row = [];
      for (let c = 0; c < n; c++) row.push(buf.readFloatLE(off + k * stride + c * 4));
      out.push(n === 1 ? row[0] : row);
    }
    return out;
  };
  return { json, accessor };
}

/* The body skeleton (Mixamo names, no fingers) of a GLB, with its rest pose and clips. */
export function skeletonFrom(file) {
  const { json, accessor } = readGlb(file);
  const N = json.nodes;
  const parentOf = {};
  N.forEach((n, i) => (n.children || []).forEach((c) => (parentOf[c] = i)));
  const short = (name) => (name || "").replace(/^.*:/, "");
  const hips = N.findIndex((n) => short(n.name) === "Hips");
  const keep = [];
  const walk = (i) => {
    if (/Hand(Thumb|Index|Middle|Ring|Pinky)/.test(short(N[i].name))) return;
    keep.push(i);
    (N[i].children || []).forEach(walk);
  };
  walk(hips);
  const rootIdx = parentOf[hips];
  const root = N[rootIdx];
  const bones = keep.map((i) => ({
    src: i,
    name: short(N[i].name),
    parent: i === hips ? -1 : keep.indexOf(parentOf[i]),
    t: N[i].translation || [0, 0, 0],
    r: N[i].rotation || [0, 0, 0, 1],
  }));
  const byName = Object.fromEntries(bones.map((b, k) => [b.name, k]));
  const clips = {};
  for (const an of json.animations || []) {
    const ch = {};
    let dur = 0;
    for (const c of an.channels) {
      const k = keep.indexOf(c.target.node);
      if (k < 0 || c.target.path === "scale") continue;
      const s = an.samplers[c.sampler];
      const times = accessor(s.input);
      dur = Math.max(dur, times[times.length - 1]);
      (ch[k] = ch[k] || {})[c.target.path] = { times, values: accessor(s.output) };
    }
    clips[an.name] = { duration: dur, ch };
  }
  return {
    bones,
    byName,
    root: { r: root.rotation || [0, 0, 0, 1], s: (root.scale || [1, 1, 1])[0] },
    clips,
  };
}

function sampleTrack(tr, t, isRot) {
  const { times, values } = tr;
  if (t <= times[0]) return values[0];
  if (t >= times[times.length - 1]) return values[values.length - 1];
  let i = 1;
  while (times[i] < t) i++;
  const f = (t - times[i - 1]) / (times[i] - times[i - 1]);
  return isRot ? q.slerp(values[i - 1], values[i], f) : v3.lerp(values[i - 1], values[i], f);
}

/* A pose: local rotation per bone and the hips' translation. */
export function restPose(sk) {
  return { r: sk.bones.map((b) => b.r.slice()), hips: sk.bones[0].t.slice() };
}
export function sampleClip(sk, name, t) {
  const c = sk.clips[name];
  if (!c) throw new Error(`no clip ${name}`);
  const p = restPose(sk);
  for (const [k, tr] of Object.entries(c.ch)) {
    if (tr.rotation) p.r[k] = sampleTrack(tr.rotation, t, true);
    if (tr.translation && +k === 0) p.hips = sampleTrack(tr.translation, t, false);
  }
  return p;
}
export function blendPose(a, b, t) {
  return { r: a.r.map((r, i) => q.slerp(r, b.r[i], t)), hips: v3.lerp(a.hips, b.hips, t) };
}
export function clonePose(p) {
  return { r: p.r.map((r) => r.slice()), hips: p.hips.slice() };
}

/* Forward kinematics, in the GLB's world space (glTF: y up, the character facing +z). */
export function fk(sk, pose) {
  const n = sk.bones.length;
  const R = new Array(n);
  const P = new Array(n);
  sk.bones.forEach((b, i) => {
    const pr = b.parent < 0 ? sk.root.r : R[b.parent];
    const pp = b.parent < 0 ? [0, 0, 0] : P[b.parent];
    const lt = i === 0 ? pose.hips : b.t;
    R[i] = q.mul(pr, pose.r[i]);
    P[i] = v3.add(pp, q.rot(pr, v3.scale(lt, sk.root.s)));
  });
  return { R, P };
}

/* Turn bone `name` (in world space) so the direction to `child` becomes `dir`. */
export function aim(sk, pose, name, child, dir) {
  const i = sk.byName[name];
  const c = sk.byName[child];
  const w = fk(sk, pose);
  const d = v3.sub(w.P[c], w.P[i]);
  const turn = q.fromTo(d, dir);
  const pr = sk.bones[i].parent < 0 ? sk.root.r : w.R[sk.bones[i].parent];
  pose.r[i] = q.norm(q.mul(q.inv(pr), q.mul(turn, w.R[i])));
}
/* Turn bone `name` by `ang` radians about a world axis. */
export function turn(sk, pose, name, axis, ang) {
  const i = sk.byName[name];
  const w = fk(sk, pose);
  const pr = sk.bones[i].parent < 0 ? sk.root.r : w.R[sk.bones[i].parent];
  pose.r[i] = q.norm(q.mul(q.inv(pr), q.mul(q.axis(axis, ang), w.R[i])));
}

/* Write a clip GLB: the skeleton (prefix mixamorig:), a one-triangle skinned mesh so
   importers make an armature, and one animation sampled from `frames` (poses at `fps`). */
export function writeClipGlb(file, sk, name, frames, fps) {
  const parts = [];
  let len = 0;
  const views = [];
  const accessors = [];
  const push = (arr, type, comp = 5126, extra = {}) => {
    const n = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
    const flat = arr.flat ? arr.flat() : arr;
    const bytes = comp === 5126 ? Buffer.from(new Float32Array(flat).buffer) : comp === 5121 ? Buffer.from(new Uint8Array(flat)) : Buffer.from(new Uint16Array(flat).buffer);
    const pad = (4 - (bytes.length % 4)) % 4;
    views.push({ buffer: 0, byteOffset: len, byteLength: bytes.length });
    parts.push(bytes, Buffer.alloc(pad));
    len += bytes.length + pad;
    accessors.push({ bufferView: views.length - 1, componentType: comp, count: flat.length / n, type, ...extra });
    return accessors.length - 1;
  };
  const nb = sk.bones.length;
  const J0 = 2; // node index of the first bone
  const nodes = [
    { name: "Armature", rotation: sk.root.r, scale: [sk.root.s, sk.root.s, sk.root.s], children: [J0, 1] },
    { name: "Body", mesh: 0, skin: 0 },
  ];
  sk.bones.forEach((b, i) => {
    const kids = sk.bones.map((c, k) => (c.parent === i ? J0 + k : -1)).filter((k) => k >= 0);
    nodes.push({ name: "mixamorig:" + b.name, translation: b.t, rotation: b.r, ...(kids.length ? { children: kids } : {}) });
  });
  // inverse bind matrices of the rest pose, relative to the armature (the skin's space)
  const ibm = [];
  const restR = [];
  const restP = [];
  sk.bones.forEach((b, i) => {
    const pr = b.parent < 0 ? [0, 0, 0, 1] : restR[b.parent];
    const pp = b.parent < 0 ? [0, 0, 0] : restP[b.parent];
    restR[i] = q.mul(pr, b.r);
    restP[i] = v3.add(pp, q.rot(pr, b.t));
    const inv = q.inv(restR[i]);
    const ip = q.rot(inv, v3.scale(restP[i], -1));
    const cx = q.rot(inv, [1, 0, 0]);
    const cy = q.rot(inv, [0, 1, 0]);
    const cz = q.rot(inv, [0, 0, 1]);
    ibm.push(cx[0], cx[1], cx[2], 0, cy[0], cy[1], cy[2], 0, cz[0], cz[1], cz[2], 0, ip[0], ip[1], ip[2], 1);
  });
  const hp = restP[0];
  const pos = push([hp[0], hp[1], hp[2], hp[0] + 5, hp[1], hp[2], hp[0], hp[1] + 5, hp[2]], "VEC3", 5126, {
    min: [hp[0], hp[1], hp[2]],
    max: [hp[0] + 5, hp[1] + 5, hp[2]],
  });
  const joints = push([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "VEC4", 5121);
  const weights = push([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], "VEC4");
  const ibmAcc = push(ibm, "MAT4");
  const times = frames.map((_, k) => k / fps);
  const tAcc = push(times, "SCALAR", 5126, { min: [0], max: [times[times.length - 1]] });
  const channels = [];
  const samplers = [];
  for (let i = 0; i < nb; i++) {
    samplers.push({ input: tAcc, output: push(frames.map((f) => f.r[i]), "VEC4"), interpolation: "LINEAR" });
    channels.push({ sampler: samplers.length - 1, target: { node: J0 + i, path: "rotation" } });
  }
  samplers.push({ input: tAcc, output: push(frames.map((f) => f.hips), "VEC3"), interpolation: "LINEAR" });
  channels.push({ sampler: samplers.length - 1, target: { node: J0, path: "translation" } });
  const json = {
    asset: { version: "2.0", generator: "icanbe scripts/small-weather-clips.mjs" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    meshes: [{ name: "Body", primitives: [{ attributes: { POSITION: pos, JOINTS_0: joints, WEIGHTS_0: weights } }] }],
    skins: [{ name: "Armature", joints: sk.bones.map((_, i) => J0 + i), inverseBindMatrices: ibmAcc, skeleton: J0 }],
    animations: [{ name, channels, samplers }],
    buffers: [{ byteLength: len }],
    bufferViews: views,
    accessors,
  };
  let js = Buffer.from(JSON.stringify(json), "utf8");
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const bin = Buffer.concat(parts);
  const head = Buffer.alloc(12);
  head.write("glTF", 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (b, type) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(b.length, 0);
    h.write(type, 4);
    return Buffer.concat([h, b]);
  };
  fs.writeFileSync(file, Buffer.concat([head, ch(js, "JSON"), ch(bin, "BIN\0")]));
}
