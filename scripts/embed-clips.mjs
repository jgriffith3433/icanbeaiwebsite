/* ==========================================================================
   Put the clips of art/small-weather/model-clips/*.glb (written by scripts/small-weather-clips.mjs, on his own rest pose) into
   models/small-weather.glb as its animations, replacing the ones Hawkes Gen's rig copied from the Mixamo source
   (those were written against the wrong rest pose: tipped pelvis, forward neck, twisted jump).
   Rotation channels for every bone, the hips' translation only; the old accessors are dropped and the binary chunk
   is rebuilt without them. Run: node scripts/embed-clips.mjs   (then npm test)
   ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readGlb } from "./gltf-skeleton.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const MODEL = path.join(here, "..", "models", "small-weather.glb");
const CLIPS = path.join(here, "..", "art", "small-weather", "model-clips");
export const EMBEDDED = ["idle", "walk", "run", "jump", "fall", "float", "cast", "throw", "sit", "type", "phone", "lie", "side", "recline"];

const buf = fs.readFileSync(MODEL);
const jl = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jl).toString("utf8"));
const bin = buf.subarray(20 + jl + 8);
const short = (n) => (n || "").replace(/^.*:/, "");
const nodeOf = Object.fromEntries(json.nodes.map((n, i) => [short(n.name), i]));

const extra = []; // new accessor data: { bytes, type, count, min, max }
const accNew = (arr, type, min, max) => {
  const flat = arr.flat();
  extra.push({ bytes: Buffer.from(new Float32Array(flat).buffer), type, count: type === "SCALAR" ? flat.length : type === "VEC3" ? flat.length / 3 : flat.length / 4, min, max });
  return json.accessors.length + extra.length - 1;
};

const animations = [];
for (const name of EMBEDDED) {
  const file = path.join(CLIPS, name + ".glb");
  const { json: cj, accessor } = readGlb(file);
  const an = cj.animations[0];
  const times = accessor(an.samplers[0].input);
  const tIn = accNew(times, "SCALAR", [times[0]], [times[times.length - 1]]);
  const channels = [];
  const samplers = [];
  for (const c of an.channels) {
    const dest = nodeOf[short(cj.nodes[c.target.node].name)];
    if (dest == null) throw new Error(`${name}: no node ${cj.nodes[c.target.node].name} in the model`);
    const s = an.samplers[c.sampler];
    const out = accessor(s.output);
    samplers.push({ input: tIn, output: accNew(out, c.target.path === "rotation" ? "VEC4" : "VEC3"), interpolation: "LINEAR" });
    channels.push({ sampler: samplers.length - 1, target: { node: dest, path: c.target.path } });
  }
  animations.push({ name, channels, samplers });
}
const keep = json.animations.filter((a) => !EMBEDDED.includes(a.name));
json.animations = [...animations, ...keep];

// ---- rebuild the binary chunk: only what the mesh, skin, images and animations still use
const accs = json.accessors.concat(extra.map((e) => ({ _extra: e, componentType: 5126, count: e.count, type: e.type, ...(e.min ? { min: e.min, max: e.max } : {}) })));
const usedAcc = new Set();
for (const m of json.meshes) for (const p of m.primitives) {
  Object.values(p.attributes).forEach((i) => usedAcc.add(i));
  if (p.indices != null) usedAcc.add(p.indices);
}
json.skins.forEach((s) => s.inverseBindMatrices != null && usedAcc.add(s.inverseBindMatrices));
json.animations.forEach((a) => a.samplers.forEach((s) => { usedAcc.add(s.input); usedAcc.add(s.output); }));
const accMap = new Map();
const newAccs = [];
const views = new Map(); // old bufferView -> new index
const newViews = [];
const parts = [];
let len = 0;
const addBytes = (b) => {
  const off = len;
  parts.push(b, Buffer.alloc((4 - (b.length % 4)) % 4));
  len += b.length + ((4 - (b.length % 4)) % 4);
  return off;
};
const viewOf = (old) => {
  if (!views.has(old)) {
    const v = json.bufferViews[old];
    const off = addBytes(bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength));
    newViews.push({ buffer: 0, byteOffset: off, byteLength: v.byteLength, ...(v.byteStride ? { byteStride: v.byteStride } : {}), ...(v.target ? { target: v.target } : {}) });
    views.set(old, newViews.length - 1);
  }
  return views.get(old);
};
[...usedAcc].sort((a, b) => a - b).forEach((i) => {
  const a = accs[i];
  const na = { ...a };
  if (a._extra) {
    delete na._extra;
    const off = addBytes(a._extra.bytes);
    newViews.push({ buffer: 0, byteOffset: off, byteLength: a._extra.bytes.length });
    na.bufferView = newViews.length - 1;
  } else na.bufferView = viewOf(a.bufferView);
  newAccs.push(na);
  accMap.set(i, newAccs.length - 1);
});
json.images.forEach((im) => { if (im.bufferView != null) im.bufferView = viewOf(im.bufferView); });
for (const m of json.meshes) for (const p of m.primitives) {
  for (const k of Object.keys(p.attributes)) p.attributes[k] = accMap.get(p.attributes[k]);
  if (p.indices != null) p.indices = accMap.get(p.indices);
}
json.skins.forEach((s) => s.inverseBindMatrices != null && (s.inverseBindMatrices = accMap.get(s.inverseBindMatrices)));
json.animations.forEach((a) => a.samplers.forEach((s) => { s.input = accMap.get(s.input); s.output = accMap.get(s.output); }));
json.accessors = newAccs;
json.bufferViews = newViews;
json.buffers = [{ byteLength: len }];

let js = Buffer.from(JSON.stringify(json), "utf8");
js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const body = Buffer.concat(parts);
const head = Buffer.alloc(12);
head.write("glTF", 0);
head.writeUInt32LE(2, 4);
head.writeUInt32LE(12 + 8 + js.length + 8 + body.length, 8);
const chunk = (b, type) => {
  const h = Buffer.alloc(8);
  h.writeUInt32LE(b.length, 0);
  h.write(type, 4);
  return Buffer.concat([h, b]);
};
fs.writeFileSync(MODEL, Buffer.concat([head, chunk(js, "JSON"), chunk(body, "BIN\0")]));
console.log(`models/small-weather.glb: ${(fs.statSync(MODEL).size / 1048576).toFixed(2)} MB, ${json.animations.length} animations`);
