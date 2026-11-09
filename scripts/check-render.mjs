// Rendering quality, without a GPU: builds the world and the city under Babylon's NullEngine and checks the geometry
// for the mistakes a player sees at once (Jaycee's 3D quality rules 1 to 3):
//   - inside-out meshes: triangles wound against their own normals (culled from the side you look at),
//   - mirrored: a world matrix or thin instance with negative scale,
//   - backwards text: a mesh drawn with a canvas texture that is double sided (its back copy shows the text mirrored),
//   - z-fighting: two different surfaces facing up at the same height (within 3 mm) over the same ground,
//   - holes: every junction of the street grid has asphalt on top,
//   - the sky dome stands behind the farthest skyline tower and inside the camera's far plane.
//
//   node scripts/check-render.mjs   (part of npm test)
import * as core from '@babylonjs/core';

const B = core;
const problems = [];
const ok = (c, m) => (c ? true : (problems.push(m), false));

class Engine extends core.NullEngine {
  constructor() {
    super({ renderHeight: 360, renderWidth: 640, textureSize: 256, deterministicLockstep: false, lockstepMaxSteps: 1 });
    this.getCaps().instancedArrays = true; // keep thin instances (the NullEngine drops them otherwise): they are most of the city
  }
}
core.Logger.LogLevels = core.Logger.NoneLogLevel;
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => ((t[k] = v), true) });
const document = { createElement: () => ({ getContext: () => ctx2d, width: 0, height: 0, style: {} }) };
const events = { addEventListener() {}, removeEventListener() {} };
Object.assign(globalThis, { window: globalThis, BABYLON: { ...core, Engine }, document, devicePixelRatio: 1, ...events });
const origWarn = console.warn;
const origLog = console.log;
console.warn = () => {};
console.log = (...a) => { if (!/^BJS/.test(String(a[0]))) origLog(...a); };
const root = new URL('../', import.meta.url);
for (const f of ['day.config.js', 'js/schedule.js', 'js/world.js']) await import(new URL(f, root).href);
const cfg = globalThis.DAY_CONFIG;
const day = globalThis.DayEngine.build(cfg, '2026-10-19');
const world = globalThis.DayWorld.create({ ...events, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }) }, cfg, day.spots, day.rooms);
const { installLook } = await import(new URL('js/look.js', root).href);
installLook(world);
const { installCityscape } = await import(new URL('js/cityscape.js', root).href);
installCityscape(world);
const { installCrowd } = await import(new URL('js/crowd.js', root).href);
installCrowd(world); // the page's traffic (it takes the lanes over from world.js's old cars)
world.update(globalThis.DayEngine.frame(day, 12 * 60), 0.016, { snap: true });
world.scene.render();
console.warn = origWarn;
const scene = world.scene;

// Meshes the player isn't meant to see from outside (seen from inside on purpose), or particles and helpers.
const insideOnPurpose = /^skyDome$/;
const meshes = scene.meshes.filter((m) => m.getTotalVertices && m.getTotalVertices() > 0);

/* ---- inside out: given normals against Babylon's own (from the winding) ---- */
const inside = [];
for (const m of meshes) {
  if (insideOnPurpose.test(m.name)) continue;
  const pos = m.getVerticesData(B.VertexBuffer.PositionKind);
  const nrm = m.getVerticesData(B.VertexBuffer.NormalKind);
  const idx = m.getIndices();
  if (!pos || !nrm || !idx || !idx.length || m._originalBuilderSideOrientation === B.Mesh.DOUBLESIDE) continue;
  const cn = [];
  B.VertexData.ComputeNormals(pos, idx, cn);
  let opposed = 0;
  for (let i = 0; i < nrm.length; i += 3) if (cn[i] * nrm[i] + cn[i + 1] * nrm[i + 1] + cn[i + 2] * nrm[i + 2] < -0.05) opposed++;
  if (opposed > Math.max(2, (nrm.length / 3) * 0.01)) inside.push(`${m.name} (${opposed}/${nrm.length / 3} vertices)`);
}
ok(!inside.length, `meshes wound inside out (their faces point away from their normals): ${inside.slice(0, 8).join(', ')}`);

/* ---- mirrored: negative scale on a mesh or a thin instance ---- */
const mirrored = [];
const isSkin = (m) => { for (let p = m.parent; p; p = p.parent) if (/__root__/.test(p.name)) return true; return false; };
for (const m of meshes) {
  if (isSkin(m)) continue; // the glTF root's handedness flip is Babylon's own
  if (m.computeWorldMatrix(true).determinant() < 0) mirrored.push(m.name);
  if (m.hasThinInstances) {
    const n = m.thinInstanceGetWorldMatrices().filter((M) => M.determinant() < 0).length;
    if (n) mirrored.push(`${m.name} (${n} thin instances)`);
  }
}
ok(!mirrored.length, `mirrored meshes (negative scale flips text and winding): ${mirrored.slice(0, 8).join(', ')}`);

/* ---- backwards text: canvas-textured meshes are one-sided ---- */
const textTwoSided = [];
for (const m of meshes) {
  const mat = m.material;
  if (!mat) continue;
  const dyn = [mat.diffuseTexture, mat.emissiveTexture, mat.albedoTexture].some((t) => t && t.getClassName && t.getClassName() === 'DynamicTexture');
  if (!dyn) continue;
  if (m._originalBuilderSideOrientation === B.Mesh.DOUBLESIDE) textTwoSided.push(m.name);
}
ok(!textTwoSided.length, `canvas-textured meshes are double sided, so their back shows the texture mirrored: ${textTwoSided.slice(0, 8).join(', ')}`);

/* ---- z-fighting: up-facing surfaces of different materials at the same height over the same ground ---- */
const flats = [];
const v = new B.Vector3();
for (const m of meshes) {
  if (!m.isEnabled() || !m.isVisible || insideOnPurpose.test(m.name)) continue;
  const mat = m.material;
  if (mat && (mat.zOffset || mat.disableDepthWrite || mat.alpha < 1)) continue; // decals and see-through layers
  const pos = m.getVerticesData(B.VertexBuffer.PositionKind);
  const idx = m.getIndices();
  if (!pos || !idx) continue;
  const wm = m.computeWorldMatrix(true);
  const mats = m.hasThinInstances ? m.thinInstanceGetWorldMatrices().map((M) => M.multiply(wm)) : [wm];
  const culled = !mat || mat.backFaceCulling !== false;
  for (const M of mats) {
    const p = (i) => B.Vector3.TransformCoordinatesFromFloatsToRef(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2], M, v).clone();
    for (let i = 0; i < idx.length; i += 3) {
      const a = p(idx[i]);
      const b = p(idx[i + 1]);
      const c = p(idx[i + 2]);
      if (Math.abs(a.y - b.y) > 1e-4 || Math.abs(a.y - c.y) > 1e-4) continue;
      const cy = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
      if (culled && !(cy < 0)) continue; // only faces seen from above
      if (Math.abs(cy) / 2 < 0.05) continue;
      flats.push({ mesh: m.name, par: m.parent ? m.parent.name : '', mat: mat ? mat.name : '', y: a.y, x0: Math.min(a.x, b.x, c.x), x1: Math.max(a.x, b.x, c.x), z0: Math.min(a.z, b.z, c.z), z1: Math.max(a.z, b.z, c.z) });
    }
  }
}
flats.sort((a, b) => a.y - b.y);
const fights = new Map();
for (let i = 0; i < flats.length; i++) {
  for (let j = i + 1; j < flats.length && flats[j].y - flats[i].y <= 0.003; j++) {
    const A = flats[i];
    const C = flats[j];
    if (A.mat === C.mat) continue; // the same material and colour: an overlap can't be seen
    const ox = Math.min(A.x1, C.x1) - Math.max(A.x0, C.x0);
    const oz = Math.min(A.z1, C.z1) - Math.max(A.z0, C.z0);
    if (ox > 0.05 && oz > 0.05) {
      const k = [A.mesh, C.mesh].sort().join(' ~ ');
      if (!fights.has(k)) fights.set(k, `${k} at y ${A.y.toFixed(3)}` + (process.env.DEBUG ? ` [${A.par}/${C.par} ${A.mat}/${C.mat} x${A.x0.toFixed(1)} z${A.z0.toFixed(1)}]` : ''));
    }
  }
}
ok(!fights.size, `${fights.size} pairs of surfaces z-fight (same height, overlapping, different materials): ${[...fights.values()].slice(0, 6).join('; ')}`);

/* ---- holes: asphalt on top at every junction ---- */
scene.meshes.forEach((m) => { m.__pick = m.isPickable; m.isPickable = true; });
const top = (x, z) => {
  const hits = scene.multiPickWithRay(new B.Ray(new B.Vector3(x, 5, z), new B.Vector3(0, -1, 0), 10), (m) => m.isEnabled() && m.isVisible && !m.parent && !/sky|shadow|dash|zebra|stop|lane|edge|cs-/i.test(m.name)) || [];
  hits.sort((a, b) => a.distance - b.distance);
  return hits[0] ? hits[0].pickedMesh.name : 'nothing';
};
const roadName = (n) => n === 'road' || /^ave\d+r\d+$/.test(n) || /^cross\d+r\d+$/.test(n);
const holes = [];
const avenues = (cfg.city && cfg.city.avenues) || [];
const crosses = (cfg.city && cfg.city.crosses) || [];
for (const a of avenues.concat([{ z: cfg.street.z, from: cfg.street.from, to: cfg.street.to }])) {
  for (const c of crosses) {
    if (a.z < c.from || a.z > c.to || c.x < a.from || c.x > a.to) continue;
    for (const [dx, dz] of [[0, 0], [1.5, 1.5], [-1.5, -1.5]]) {
      const n = top(c.x + dx, a.z + dz);
      if (!roadName(n)) holes.push(`(${c.x + dx}, ${a.z + dz}) shows ${n}`);
    }
  }
}
scene.meshes.forEach((m) => { m.isPickable = m.__pick; });
ok(!holes.length, `junctions without asphalt: ${holes.slice(0, 6).join(', ')}`);

/* ---- the sky dome is behind the skyline and inside the far plane ---- */
const dome = scene.getMeshByName('skyDome');
const cam = scene.activeCamera;
if (dome && cam) {
  // the inscribed radius of the faceted sphere (24 segments)
  const r = dome.getBoundingInfo().boundingBox.extendSize.x * Math.min(dome.scaling.x, dome.scaling.z) * Math.cos(Math.PI / 24);
  let far = 0;
  const street = cfg.street;
  // the dome follows the camera, which can be anywhere along the street: measure from its ends
  const ends = [street.from, street.to].map((x) => ({ x, z: street.z }));
  scene.meshes.filter((m) => /skyline/i.test(m.name)).forEach((m) => {
    const wm = m.computeWorldMatrix(true);
    const list = m.hasThinInstances ? m.thinInstanceGetWorldMatrices().map((M) => M.multiply(wm)) : [wm];
    const pos = m.getVerticesData(B.VertexBuffer.PositionKind) || [];
    list.forEach((M) => {
      for (let i = 0; i < pos.length; i += 3) {
        const p = B.Vector3.TransformCoordinatesFromFloatsToRef(pos[i], pos[i + 1], pos[i + 2], M, v);
        ends.forEach((e) => (far = Math.max(far, Math.hypot(p.x - e.x, p.z - e.z))));
      }
    });
  });
  ok(r > far + 20, `the sky dome (${r.toFixed(0)} m) hides the farthest skyline tower (${far.toFixed(0)} m from the street)`);
  ok(r < cam.maxZ, `the sky dome (${r.toFixed(0)} m) is beyond the camera's far plane (${cam.maxZ} m)`);
}
ok(cam && cam.minZ >= 0.2, `camera.minZ ${cam && cam.minZ} wastes depth precision (z-fighting far off)`);

/* ---- the cutaway: no interior wall stands solid in the view of the room camera (the grey wedge down the side) ----
   At 7:30 the bedroom camera sits above the bathroom with the side panel docked; the partition at x=-1 runs toward it.
   Pick a grid of screen rays: none may land on a solid (visibility > 0.5) interior or shell wall of the home. */
{
  globalThis.document.querySelector = () => ({ hidden: false, offsetParent: {}, getBoundingClientRect: () => ({ left: 540, width: 100 }) });
  globalThis.innerWidth = 640;
  for (let i = 0; i < 60; i++) world.update(globalThis.DayEngine.frame(day, 7 * 60 + 30), 0.05, { snap: i === 0 });
  scene.render();
  const c = scene.activeCamera;
  const walls = [];
  for (let y = 0; y < 360; y += 12) for (let x = 0; x < 640; x += 16) {
    const p = scene.pickWithRay(scene.createPickingRay(x, y, B.Matrix.Identity(), c), (m) => m.isVisible && m.visibility > 0.5 && m.isEnabled());
    if (p && p.hit && /^home-(wall\d+|left|right|crownL|crownR)$/.test(p.pickedMesh.name)) walls.push(`${p.pickedMesh.name}@${x},${y}`);
  }
  ok(!walls.length, `a solid wall fills the 7:30 bedroom view (a grey wedge in the frame): ${walls.slice(0, 6).join(', ')}`);
  delete globalThis.document.querySelector;
}

console.log = origLog;
if (problems.length) {
  console.error('check-render: ' + problems.length + ' problem(s)\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log(`check-render: ok (${meshes.length} meshes: none inside out or mirrored, no double-sided text, ${flats.length} up-facing triangles without z-fighting, every junction paved, sky behind the skyline)`);
