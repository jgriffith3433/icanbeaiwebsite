/* The phone copy of Small Weather (models/small-weather.phone.glb, made by scripts/make-phone-model.mjs, no GPU):
   under 900 KB over the wire, meshopt + WebP + textures <= 1024, the same skeleton / clips / skinned shape as the full model,
   normals outward and winding agreeing with them, feet on y = 0, and it loads through js/small-weather.js (the same loader
   the page uses) with the local decoder. Also: js/app.js picks it on low quality and the full one on high. */
import fs from "node:fs";
import * as core from "@babylonjs/core";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

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


await MeshoptDecoder.ready;
// the page loads models/meshopt_decoder.js as a classic script; here the same decoder is put on the global
globalThis.MeshoptDecoder = { ...MeshoptDecoder, useWorkers() {}, decodeGltfBufferAsync: async (c, s, src, m, f) => { const o = new Uint8Array(c * s); MeshoptDecoder.decodeGltfBuffer(o, c, s, src, m, f); return o; } };
core.Tools.LoadBabylonScriptAsync = async () => {};
console.log = origLog;

const PHONE = "models/small-weather.phone.glb";
const FULL = cfg.control.model;
ok(cfg.control.modelPhone === PHONE, `day.config.js control.modelPhone is ${PHONE}`);
const size = fs.statSync(new URL(PHONE, root)).size;
ok(size < 900 * 1024, `phone model ${(size / 1024).toFixed(0)} KB, under 900 KB`);
ok(fs.statSync(new URL("models/meshopt_decoder.js", root)).size < 60 * 1024, "local meshopt decoder is small");

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const full = (await io.read(new URL(FULL, root).pathname)).getRoot();
const phoneDoc = await io.read(new URL(PHONE, root).pathname);
const phone = phoneDoc.getRoot();
ok(phone.listExtensionsUsed().some((e) => e.extensionName === "EXT_meshopt_compression"), "phone model uses meshopt");
for (const t of phone.listTextures()) {
  const [w, h] = t.getSize();
  ok(Math.max(w, h) <= 1024, `texture ${t.getName()} is ${w}x${h}, at most 1024`);
  ok(t.getMimeType() === "image/webp", `texture ${t.getName()} is WebP`);
}
ok(phone.listSkins().length === 1 && phone.listSkins()[0].listJoints().length === full.listSkins()[0].listJoints().length, "same skeleton");
ok(phone.listAnimations().length === full.listAnimations().length, "same clips");
const jn = (r) => r.listSkins()[0].listJoints().map((j) => j.getName()).join();
ok(jn(phone) === jn(full), "same joint names and order");

/* geometry in the model's own units: world-space triangle corners of the (maybe quantized) primitive */
function geom(r) {
  const node = r.listNodes().find((n) => n.getMesh());
  const m = node.getWorldMatrix();
  const p = node.getMesh().listPrimitives()[0];
  const pos = p.getAttribute("POSITION"), nor = p.getAttribute("NORMAL"), idx = p.getIndices();
  const out = { P: [], N: [], I: idx.getArray() };
  const t = [0, 0, 0];
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, t);
    out.P.push([m[0] * t[0] + m[4] * t[1] + m[8] * t[2] + m[12], m[1] * t[0] + m[5] * t[1] + m[9] * t[2] + m[13], m[2] * t[0] + m[6] * t[1] + m[10] * t[2] + m[14]]);
    nor.getElement(i, t);
    out.N.push([...t]);
  }
  return out;
}
const bounds = (g) => g.P.reduce((b, p) => p.map((v, k) => [Math.min(b[k][0], v), Math.max(b[k][1], v)]), [[1e9, -1e9], [1e9, -1e9], [1e9, -1e9]]);
/* outward: the stored normals agree with the winding, and the signed volume is positive (counter-clockwise from outside) */
function facing(g) {
  let agree = 0, n = 0, vol = 0;
  for (let i = 0; i < g.I.length; i += 3) {
    const [a, b, c] = [g.P[g.I[i]], g.P[g.I[i + 1]], g.P[g.I[i + 2]]];
    const u = b.map((v, k) => v - a[k]), v = c.map((x, k) => x - a[k]);
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const sn = [0, 1, 2].map((k) => g.N[g.I[i]][k] + g.N[g.I[i + 1]][k] + g.N[g.I[i + 2]][k]);
    if (f[0] * sn[0] + f[1] * sn[1] + f[2] * sn[2] > 0) agree++;
    vol += a[0] * f[0] + a[1] * f[1] + a[2] * f[2];
    n++;
  }
  return { agree: agree / n, vol };
}
const gf = geom(full), gp = geom(phone);
const ff = facing(gf), fp = facing(gp);
ok(fp.agree > 0.97, `winding agrees with the normals on ${(fp.agree * 100).toFixed(1)}% of faces (full ${(ff.agree * 100).toFixed(1)}%)`);
ok(fp.vol > 0 && ff.vol > 0, "signed volume positive: the faces point outward");

/* through the page's loader: same skinned bounds and bone positions as the full model */
const bytes = rd;
async function pose(path) {
  const skin = await loadSmallWeather(world, null, bytes(path), { extras });
  skin.attach ? skin.attach() : null;
  const s = skin.meshes.find((m) => m.skeleton);
  ok(!!s, `${path} has a skinned mesh`);
  s.skeleton.prepare(true);
  const nodes = skin.root.getChildTransformNodes(false);
  const at = (n) => nodes.find((t) => t.name.endsWith(n)).getAbsolutePosition().clone();
  /* the skinned shape on the CPU: bind pose, in the skin's own world units */
  const mesh = s;
  const P = mesh.getVerticesData(core.VertexBuffer.PositionKind), J = mesh.getVerticesData(core.VertexBuffer.MatricesIndicesKind), W = mesh.getVerticesData(core.VertexBuffer.MatricesWeightsKind);
  const M = s.skeleton.getTransformMatrices(mesh), wm = mesh.getWorldMatrix();
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < P.length / 3; i++) {
    const v = new core.Vector3(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = W[i * 4 + k];
      if (!w) continue;
      v.addInPlace(core.Vector3.TransformCoordinates(new core.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), core.Matrix.FromArray(M, J[i * 4 + k] * 16)).scale(w));
    }
    const q = core.Vector3.TransformCoordinates(v, wm);
    [q.x, q.y, q.z].forEach((x, d) => { lo[d] = Math.min(lo[d], x); hi[d] = Math.max(hi[d], x); });
  }
  return { skin, lo, hi, hips: at("Hips"), head: at("Head"), foot: at("LeftFoot"), hand: at("RightHand"), clips: skin.clips };
}
const a = await pose(FULL), b = await pose(PHONE);
for (const k of ["hips", "head", "foot", "hand"]) {
  const d = core.Vector3.Distance(a[k], b[k]);
  ok(d < 0.03, `${k} bone sits ${(d * 100).toFixed(1)} cm from the full model's`);
}
if (process.env.DEBUG) console.error("skinned", a.lo, a.hi, b.lo, b.hi);
for (let d = 0; d < 3; d++) ok(Math.abs(a.lo[d] - b.lo[d]) < 0.02 && Math.abs(a.hi[d] - b.hi[d]) < 0.02, `skinned axis ${"xyz"[d]}: ${b.lo[d].toFixed(3)}..${b.hi[d].toFixed(3)} vs full ${a.lo[d].toFixed(3)}..${a.hi[d].toFixed(3)}`);
ok(Math.abs(b.lo[1] - a.lo[1]) < 0.02, `feet at ${b.lo[1].toFixed(3)} m, the full model's ${a.lo[1].toFixed(3)} m`);
ok(JSON.stringify(a.clips) === JSON.stringify(b.clips), "same clip list on the skin");

/* the page: phone and low quality get the phone model, desktop high the full one, the decoder is local */
const app = fs.readFileSync(new URL("js/app.js", root), "utf8");
const sw = fs.readFileSync(new URL("js/small-weather.js", root), "utf8");
ok(/modelPhone/.test(app) && /quality\(\) === "low"/.test(app), "js/app.js picks control.modelPhone on low quality");
ok(/models\/meshopt_decoder\.js/.test(sw), "js/small-weather.js points Babylon at the local decoder");
console.log(failed ? `${failed} check(s) failed` : `phone model ok: ${(size / 1024).toFixed(0)} KB`);
process.exit(failed ? 1 : 0);
