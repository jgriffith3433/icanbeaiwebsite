// Builds the day and the 3D world without a browser (Babylon's NullEngine) and turns Havok physics on, the way the
// page does, then checks what the page relies on: Babylon 9, the day compiles without errors, the colliders exist and
// stand where the world is (ground, a building floor, a wall, a house), and the person is Small Weather; then taking
// control: he walks, runs, jumps three times, floats, and walks back to his day by its routes.
//
//   npm test
//
// No GPU, no browser: rendering isn't checked here (the playtests do that).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as core from '@babylonjs/core';
import HavokPhysics from '@babylonjs/havok';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const problems = [];
const ok = (cond, msg) => {
  if (!cond) problems.push(msg);
  return cond;
};

// The page's globals, with an engine that draws nothing.
class Engine extends core.NullEngine {
  constructor() {
    super({ renderHeight: 360, renderWidth: 640, textureSize: 256, deterministicLockstep: false, lockstepMaxSteps: 1 });
  }
}
const BABYLON = { ...core, Engine };
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => ((t[k] = v), true) });
const document = { createElement: () => ({ getContext: () => ctx2d, width: 0, height: 0, style: {} }) };
// The files load as modules, the way js/app.js imports them in the page.
const events = { addEventListener() {}, removeEventListener() {} };
Object.assign(globalThis, { window: globalThis, BABYLON, document, devicePixelRatio: 1, ...events });
for (const f of ['day.config.js', 'js/schedule.js', 'js/world.js']) await import(new URL(f, root).href);
const sandbox = globalThis;

const cfg = sandbox.DAY_CONFIG;
ok(/^9\./.test(core.Engine.Version), `Babylon is ${core.Engine.Version}, not 9`);
ok(cfg.person && cfg.person.name === 'Small Weather', `day.config.js person.name is "${cfg.person && cfg.person.name}", not Small Weather`);

const day = sandbox.DayEngine.build(cfg, '2026-10-19');
ok(!day.errors.length, `day.config.js errors: ${day.errors.join('; ')}`);
ok(day.actions.length > 300, `only ${day.actions.length} actions in the day`);
// A week of days, so lines that only happen by chance are read too.
const texts = new Set();
for (let d = 12; d <= 25; d++) sandbox.DayEngine.build(cfg, `2026-10-${d}`).actions.forEach((a) => texts.add(a.text));
const theyLines = [...texts].filter((t) => /\b(they|their|theirs|themselves)\b/i.test(t));
ok([...texts].some((t) => t.includes('Small Weather')), 'no line in the day names Small Weather');
ok(!theyLines.length, `lines that still say "they": ${theyLines.slice(0, 5).join(' | ')}`);

const world = sandbox.DayWorld.create({ ...events, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }) }, cfg, day.spots, day.rooms);
ok(world && world.person, 'the world has no person');
const { installLook } = await import(new URL('js/look.js', root).href);
installLook(world);
world.update(sandbox.DayEngine.frame(day, 12 * 60), 0.016, { snap: true });
world.scene.render();
const look = world.look && world.look.info();
ok(look && look.pbr >= 4, `the city has ${look && look.pbr} PBR surfaces`);
ok(look && look.textured >= 4, 'city surfaces have no textures');
ok(look && look.neon >= 6, `only ${look && look.neon} neon signs`);
const road = world.scene.getMeshByName('road');
ok(road && road.material && road.material.getClassName() === 'PBRMaterial', 'the road is still a flat colour');
const uv = road && road.getVerticesData(core.VertexBuffer.UVKind);
let maxU = 0;
if (uv) for (let i = 0; i < uv.length; i += 2) maxU = Math.max(maxU, Math.abs(uv[i]));
ok(maxU > 2, `the road texture doesn't tile (uv ${maxU.toFixed(2)})`);
const noonSky = world.look.skyAt(12);
const duskSky = world.look.skyAt(18.5);
const nightSky = world.look.skyAt(22);
ok(noonSky.day > 0.8, `noon sky weight is ${noonSky.day.toFixed(2)}, not day`);
ok(duskSky.dusk > 0.3, `dusk sky weight is ${duskSky.dusk.toFixed(2)}`);
ok(nightSky.night > 0.8, `night sky weight is ${nightSky.night.toFixed(2)}`);
ok(look.exposure >= 0.85 && look.exposure <= 1.05, `noon exposure is ${look.exposure.toFixed(2)} (expected 0.88–0.95)`);
world.look.quality('low');
const low = world.look.info();
ok(low.quality === 'low' && low.bloom === false && low.shadows === false && low.samples === 1, `low quality didn't take (bloom ${low.bloom}, shadows ${low.shadows}, samples ${low.samples})`);
world.look.quality('high');
ok(world.look.info().bloom === true, 'high quality left bloom off');

const wasmBinary = fs.readFileSync(require.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm'));
const havok = await HavokPhysics({ wasmBinary });
const p = world.enablePhysics(havok);
ok(p.bodies === 3, `${p.bodies} collider bodies (ground, town, rooms expected)`);
ok(p.colliders > 200, `only ${p.colliders} colliders`);
world.scene.render(); // one physics step

const near = (a, b, d = 0.05) => a != null && Math.abs(a - b) <= d;
const hit = (x, z, from) => world.groundAt(x, z, from);
const street = cfg.street;
const g = hit(street.from + 30, street.z + 40, 3);
ok(g && near(g.y, 0), `nothing to stand on in the open field (hit ${JSON.stringify(g)})`);
const r = hit(street.from + 30, street.z, 3);
ok(r && near(r.y, 0.04), `the road isn't solid (hit ${JSON.stringify(r)})`);
const home = cfg.buildings.home;
const ho = home.origin || [0, 0];
const hb = home.bounds;
const inside = hit((hb[0] + hb[2]) / 2 + ho[0], (hb[1] + hb[3]) / 2 + ho[1], 0.5);
ok(inside && near(inside.y, 0.1), `the home's floor isn't solid (hit ${JSON.stringify(inside)})`);
const backWall = hit((hb[0] + hb[2]) / 2 + ho[0], hb[1] + ho[1], 6);
ok(backWall && backWall.y > 2.5, `the home's back wall isn't solid (hit ${JSON.stringify(backWall)})`);
const bed = day.spots.bed;
const onBed = bed && hit(bed.x, bed.z, 2);
ok(onBed && onBed.y > 0.3, `the bed isn't solid (hit ${JSON.stringify(onBed)})`);

// A capsule the size of a person, dropped onto the street, comes to rest on it.
const cap = core.MeshBuilder.CreateCapsule('probe', { height: 1.8, radius: 0.3 }, world.scene);
cap.position.set(street.from + 30, 2, street.z + 40);
const agg = new core.PhysicsAggregate(cap, core.PhysicsShapeType.CAPSULE, { mass: 70 }, world.scene);
const physicsEngine = world.scene.getPhysicsEngine();
for (let i = 0; i < 180; i++) physicsEngine._step(1 / 60);
ok(near(cap.position.y, 0.9, 0.1), `a person-sized capsule ended at y=${cap.position.y.toFixed(2)}, not standing on the ground`);
agg.dispose();

// Taking control (js/control.js): he stands up beside the couch, walks, runs, jumps three times and floats down,
// then walks back by the day's route (through the doors) to the bed. The page isn't needed: createMover is the movement.
const { createMover, MOVE_DEFAULTS } = await import(new URL('js/control.js', root).href);
const E = sandbox.DayEngine;
const couch = day.spots.couch;
const bedSpot = day.spots.bed;
const walkRoute = E.route(day.rooms, { x: couch.x, z: couch.z, room: couch.room }, bedSpot);
const bedDoors = day.rooms.bedroom.doors;
ok(walkRoute.length === 2 + bedDoors.length && walkRoute.some((q) => near(q.x, bedDoors[0].x, 1e-6) && near(q.z, bedDoors[0].z, 1e-6)), `the route from the couch to the bed doesn't go through the bedroom's doors (${JSON.stringify(walkRoute)})`);
ok(E.roomAt(day.rooms, couch.x, couch.z) === 'living', `roomAt the couch is ${E.roomAt(day.rooms, couch.x, couch.z)}, not living`);
const mover = createMover(world, cfg);
const M = mover.move;
const ms = mover.state;
const DT = 1 / 60;
const physicsStep = () => physicsEngine._step(DT);
const hold = (sec, input) => {
  for (let i = 0; i < Math.round(sec * 60); i++) {
    mover.step(DT, i === 0 ? input : { ...input, jump: 0 });
    physicsStep();
  }
};
const at = mover.start(couch.x, couch.z, couch.face);
ok(mover.hasPhysics(), 'taking control made no Havok character controller');
ok(Math.hypot(at.x - couch.x, at.z - couch.z) > 0.2 && ms.y < 0.3, `taking control on the couch didn't stand him up beside it (at ${at.x.toFixed(2)},${at.z.toFixed(2)} y ${ms.y.toFixed(2)})`);
hold(0.4, { x: 0, z: 0 });
ok(ms.grounded && ms.anim === 'idle', `standing still he isn't grounded and idle (${ms.anim}, grounded ${ms.grounded})`);
let x0 = ms.x;
hold(1, { x: 1, z: 0 });
const walked = ms.x - x0;
ok(walked > M.walk * 0.8 && ms.anim === 'walk', `walking for 1 s moved him ${walked.toFixed(2)} m (${ms.anim})`);
x0 = ms.x;
hold(0.8, { x: -1, z: 0, sprint: true });
ok(ms.speed > M.walk * 1.8 && ms.anim === 'run', `sprinting: ${ms.speed.toFixed(2)} m/s (${ms.anim}), walking is ${M.walk}`);
hold(0.6, { x: 0, z: 0 });
const y0 = ms.y;
let peak = y0;
let floatFall = 0;
for (let i = 0; i < 60 * 14; i++) {
  const jump = i === 0 || i === 40 || i === 80 || i === 120 ? 1 : 0; // the 4th press is one too many
  // Hold to glide for a bit, then release so the slow glide fall still lands inside the window.
  const hold = i > 140 && i < 60 * 4;
  mover.step(DT, { x: 0, z: 0, jump, hold });
  physicsStep();
  peak = Math.max(peak, ms.y);
  if (ms.anim === 'float' || ms.gliding) floatFall = Math.max(floatFall, -ms.vy);
}
ok(ms.lastFlight && ms.lastFlight.jumps === 1 + M.airJumps, `jumping four times in the air made ${ms.lastFlight && ms.lastFlight.jumps} jumps, not ${1 + M.airJumps}`);
ok(peak - y0 > M.jumpHeight + M.airJumpHeight, `three jumps only reached ${(peak - y0).toFixed(2)} m`);
ok(floatFall > 0 && floatFall <= M.glideFall + 1e-6, `holding jump while falling: he fell at ${floatFall.toFixed(2)} m/s (glide is ${M.glideFall})`);
ok(ms.grounded, 'he never landed after the jumps');
let steps = 0;
let back;
do {
  back = mover.walkBack(DT, { x: bedSpot.x, z: bedSpot.z, room: 'bedroom' });
  steps++;
} while (back === 'walking' && steps < 60 * 60);
ok(back === 'arrived' && Math.hypot(ms.x - bedSpot.x, ms.z - bedSpot.z) < 0.02, `the walk back to the bed ended "${back}" at ${ms.x.toFixed(2)},${ms.z.toFixed(2)}`);
// Storm-riding: hold jump in the air and he glides forward; an updraft lifts him to rooftop height.
mover.start(0, 0, 0);
hold(0.3, { x: 0, z: 0 });
const gy0 = ms.y;
let glided = false;
let glideSpeed = 0;
for (let i = 0; i < 60 * 3; i++) {
  const jump = i === 0 ? 1 : 0;
  mover.step(DT, { x: 0, z: 1, jump, hold: i > 20 });
  physicsStep();
  if (ms.gliding) {
    glided = true;
    glideSpeed = Math.max(glideSpeed, Math.hypot(ms.vx, ms.vz));
  }
}
ok(glided, 'holding jump in the air never set gliding');
ok(glideSpeed > M.sprint * 0.85, `glide speed only ${glideSpeed.toFixed(2)} m/s (sprint is ${M.sprint})`);
ok(ms.y > gy0 + 0.4 || ms.anim === 'float' || ms.gliding || ms.grounded, 'glide flight ended in a bad state');
const roofH = ((cfg.city && cfg.city.blocks) || []).filter((b) => b.stair).reduce((h, b) => Math.max(h, b.h), 6);
mover.start(0, 0, 0);
hold(0.2, { x: 0, z: 0 });
mover.spawnUpdraft(ms.x, ms.z, { r: 5, lift: 9, life: 8, kind: 'gust' });
const uy0 = ms.y;
let upPeak = uy0;
for (let i = 0; i < 60 * 5; i++) {
  const jump = i === 0 ? 1 : 0;
  mover.step(DT, { x: 0, z: 0, jump, hold: true });
  physicsStep();
  upPeak = Math.max(upPeak, ms.y);
}
ok(upPeak - uy0 > roofH - 0.5, `an updraft only lifted him ${(upPeak - uy0).toFixed(2)} m (rooftop needs ~${roofH.toFixed(1)} m)`);

// The district: the park is solid ground, three roofs hold him, a stair gets him up and back down,
// and a building stops him. createMover's step() is world-direction input (the playtest uses keys).
const city = cfg.city || { blocks: [], park: null };
const roofs = (city.blocks || []).filter((b) => b.stair);
ok(roofs.length >= 3, `the city has ${roofs.length} roofs with stairs, need at least 3`);
const park = city.park;
if (park) {
  const px = (park.x0 + park.x1) / 2;
  const pz = park.z0 + 8;
  const under = hit(px, pz, 4);
  ok(under && under.y < 0.3, `the park isn't open ground (hit ${JSON.stringify(under)})`);
}
function walkToward(tx, tz, sec, close = 0.35) {
  const n = Math.round(sec * 60);
  let still = 0;
  for (let i = 0; i < n; i++) {
    const dx = tx - ms.x;
    const dz = tz - ms.z;
    if (Math.hypot(dx, dz) < close) return true;
    const d = Math.hypot(dx, dz) || 1;
    mover.step(DT, { x: dx / d, z: dz / d });
    physicsStep();
    if (ms.y < -0.4) return false;
    still = ms.speed < 0.05 ? still + 1 : 0;
    if (still > 90) return Math.hypot(tx - ms.x, tz - ms.z) < close + 0.45;
  }
  return Math.hypot(tx - ms.x, tz - ms.z) < close + 0.45;
}
roofs.forEach((b) => {
  const s = b.stair;
  const lip = b.z + b.d / 2 - 1.1; // on the roof, just inside the north edge, through the parapet gap
  const topX = s.x1 - 0.25;
  const base = mover.start(s.x0 - 0.9, s.z, 0);
  ok(Math.hypot(base.x - (s.x0 - 0.9), base.z - s.z) < 1.2 && ms.y < 0.4, `${b.id}: the stair doesn't start on open ground (at ${base.x.toFixed(2)},${base.z.toFixed(2)} y ${ms.y.toFixed(2)})`);
  walkToward(topX, s.z, 22, 0.2);
  ok(ms.y > b.h - 0.3, `${b.id}: the stair didn't reach the roof (y ${ms.y.toFixed(2)}, roof ${b.h}, at ${ms.x.toFixed(1)},${ms.z.toFixed(1)})`);
  walkToward(topX, lip, 6);
  walkToward(b.x, b.z, 8);
  const onRoof = ms.y > b.h - 0.35 && Math.abs(ms.x - b.x) < b.w / 2 - 0.4 && Math.abs(ms.z - b.z) < b.d / 2 - 0.4;
  ok(onRoof, `${b.id}: he isn't standing on the roof (y ${ms.y.toFixed(2)} at ${ms.x.toFixed(1)},${ms.z.toFixed(1)})`);
  const yRoof = ms.y;
  hold(0.4, { x: 0, z: 0 });
  ok(Math.abs(ms.y - yRoof) < 0.15 && ms.y > b.h - 0.35, `${b.id}: the roof didn't hold him (y ${ms.y.toFixed(2)})`);
  walkToward(topX, lip, 6);
  walkToward(topX, s.z, 5);
  walkToward(s.x0 - 0.9, s.z, 22);
  ok(ms.y < 0.5, `${b.id}: he didn't walk back down the stair (y ${ms.y.toFixed(2)} at ${ms.x.toFixed(1)},${ms.z.toFixed(1)})`);
});
// Storm-riding roof to roof: from the apt roof's east edge, two jumps and hold to glide across the street to the
// shop, let go over it to drop, hold again just above its roof, and land soft on it without touching the ground.
const shop = (city.blocks || []).find((b) => b.id === "shop");
const aptRoof = roofs.find((b) => b.id === "apt");
if (aptRoof && shop) {
  const s = aptRoof.stair;
  mover.start(s.x0 - 0.9, s.z, 0);
  walkToward(s.x1 - 0.25, s.z, 22, 0.2);
  walkToward(s.x1 - 0.25, aptRoof.z + aptRoof.d / 2 - 1.1, 6);
  walkToward(aptRoof.x, aptRoof.z, 8);
  walkToward(aptRoof.x + aptRoof.w / 2 - 1.2, aptRoof.z, 10, 0.7);
  const tx = shop.x - shop.w / 2 + 1.5;
  let phase = 'glide';
  let minY = ms.y;
  for (let i = 0; i < 60 * 25; i++) {
    const jump = i === 0 || i === 12 ? 1 : 0;
    const [gx, gz] = phase === 'glide' ? [tx, shop.z] : [shop.x, shop.z];
    const d = Math.hypot(gx - ms.x, gz - ms.z) || 1;
    if (phase === 'glide' && ms.y > shop.h - 0.6 && Math.abs(ms.x - shop.x) < shop.w / 2 - 0.5) phase = 'drop';
    if (phase === 'drop' && ms.y < shop.h + 1.3) phase = 'soft';
    mover.step(DT, { x: (gx - ms.x) / d, z: (gz - ms.z) / d, jump, hold: phase !== 'drop' && i > 12 });
    physicsStep();
    minY = Math.min(minY, ms.y);
    if (i > 60 && ms.grounded) break;
  }
  const onShop = ms.grounded && ms.y > shop.h - 0.35 && Math.abs(ms.x - shop.x) < shop.w / 2 && Math.abs(ms.z - shop.z) < shop.d / 2;
  ok(onShop && minY > shop.h - 0.35, `apt → shop glide didn't land on the shop roof (${phase}, y ${ms.y.toFixed(2)} at ${ms.x.toFixed(1)},${ms.z.toFixed(1)}, min y ${minY.toFixed(2)})`);
  ok(ms.lastFlight && ms.lastFlight.soft, 'the glide onto the shop roof wasn\'t a soft landing');
}
// Into a wall: the shop's south face. He must stay outside it.
if (shop) {
  const face = shop.z - shop.d / 2;
  mover.start(shop.x, face - 1.4, 0);
  hold(1.6, { x: 0, z: 1 });
  ok(ms.z < face - 0.05 && ms.y < 1, `he walked through the shop (z ${ms.z.toFixed(2)}, wall at ${face}, y ${ms.y.toFixed(2)})`);
}
if (park) {
  mover.start(-8, park.z0 + 1.5, 0);
  const entered = walkToward(-8, park.z0 + 12, 10);
  ok(entered && ms.y < 0.4 && ms.z > park.z0 && ms.z < park.z1 && ms.x > park.x0 && ms.x < park.x1, `he didn't walk into the park (at ${ms.x.toFixed(1)},${ms.z.toFixed(1)} y ${ms.y.toFixed(2)})`);
}
ok(MOVE_DEFAULTS.airJumps === 2 && (!cfg.control || !cfg.control.move || cfg.control.move.airJumps === 2), 'Small Weather has two air jumps (his DoD fighter has two)');
// The stand-in plays every clip a rigged model will have, and the world draws him where the player put him.
const fr1 = E.frame(day, day.dayStart + 60);
for (const clip of world.avatar.clips) {
  world.avatar.place(1, 0.1, 2, 0.5);
  world.avatar.play(clip, 3, DT);
  world.update(fr1, DT, { player: { x: 1, y: 0.1, z: 2, yaw: 0.5, speed: 3, anim: clip } });
  const q = world.person.position;
  ok([q.x, q.y, q.z].every(Number.isFinite) && near(q.x, 1, 1e-6) && near(q.z, 2, 1e-6), `the stand-in isn't where the player put him after "${clip}"`);
}
['idle', 'walk', 'run', 'jump', 'fall', 'float', 'cast'].forEach((c) => ok(world.avatar.clips.includes(c), `the stand-in has no "${c}" clip`));
// His model (day.config.js control.model, js/small-weather.js): a GLB under 10 MB with every clip, worn over the
// figure: the boxes hide, the player's clips play as the controller asks, and his day picks the clip from his pose.
const modelPath = cfg.control && cfg.control.model;
let modelInfo = 'no model (the box figure)';
if (modelPath) {
  const file = new URL(modelPath, root);
  if (ok(/\.glb$/i.test(modelPath) && fs.existsSync(file), `control.model "${modelPath}" isn't a GLB in the repo`)) {
    const bytes = fs.readFileSync(file);
    ok(bytes.length < 3 * 1024 * 1024, `${modelPath} is ${(bytes.length / 1048576).toFixed(2)} MB (must be < 3 MB)`);
    const { loadSmallWeather, SKIN_CLIPS } = await import(new URL('js/small-weather.js', root).href);
    const skin = await loadSmallWeather(world, null, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
    const missing = SKIN_CLIPS.filter((c) => !skin.clips.includes(c));
    ok(!missing.length, `${modelPath} has no clip for ${missing.join(', ')}`);
    world.setSkin(skin);
    ok(skin.glowMeshes.length === 0, `skinned mesh was added to GlowLayer (${skin.glowMeshes.length} glowMeshes)`);
    ok(world.person.getChildMeshes(false).filter((m) => m.isEnabled() && !skin.meshes.includes(m) && !/phone|cup|bag/.test(m.name)).length === 0, 'the box figure still shows under his model');
    for (const clip of ['idle', 'walk', 'run', 'jump', 'fall', 'float', 'cast', 'throw']) {
      world.avatar.play(clip, 3, DT);
      ok(skin.clip() === clip, `under control, "${clip}" played "${skin.clip()}"`);
    }
    // Check standing scale (1.55m..1.90m) and grounded feet in idle, walk, run, and sit/type
    for (const clip of ['idle', 'walk', 'run']) {
      world.avatar.place(0, 0, 12.6, 0);
      world.avatar.play(clip, 2.4, DT);
      world.scene.render();
      const b = skin.root.getHierarchyBoundingVectors(true);
      const h = b.max.y - b.min.y;
      ok(h >= 1.55 && h <= 1.9, `${clip}: his model is ${h.toFixed(2)} m tall (expected 1.55–1.90 m)`);
      ok(Math.abs(b.min.y - 0) <= 0.08, `${clip}: his feet are at y=${b.min.y.toFixed(3)} instead of 0.00 (±0.08 m)`);
    }
    // his day: the first block has him in bed; later he walks, sits at his desk and types
    const seen = new Set();
    let checkedSit = false;
    for (let m = day.dayStart; m < day.dayStart + 16 * 60; m += 2) {
      world.update(E.frame(day, m), DT, { snap: true });
      const c = skin.clip();
      seen.add(c);
      if (!checkedSit && (c === 'sit' || c === 'type')) {
        world.update(E.frame(day, m), 0.5, { snap: true });
        world.scene.render();
        skin.meshes.forEach((mesh) => {
          if (mesh.skeleton) {
            mesh.skeleton.prepare(true);
            mesh.refreshBoundingInfo(true);
          }
        });
        const b = skin.root.getHierarchyBoundingVectors(true);
        const floorY = 0.1;
        ok(Math.abs(b.min.y - floorY) <= 0.08, `${c}: seated feet are at y=${b.min.y.toFixed(3)} instead of floor ${floorY} (±0.08 m)`);
        ok(b.max.y - floorY < 1.55, `${c}: seated head is ${(b.max.y - floorY).toFixed(2)} m above floor (must be < 1.55 m)`);
        checkedSit = true;
      }
    }
    ok(checkedSit, 'never checked sit/type bounding box during his day');
    ['walk', 'type'].forEach((c) => ok(seen.has(c), `in his day he never played "${c}" (${[...seen].join(' ')})`));
    world.avatar.place(0, 0, 12.6, 0);
    world.avatar.play('idle', 0, 1);
    world.scene.render();
    skin.meshes.forEach((mesh) => {
      if (mesh.skeleton) {
        mesh.skeleton.prepare(true);
        mesh.refreshBoundingInfo(true);
      }
    });
    const box = skin.root.getHierarchyBoundingVectors(true);
    const tall = box.max.y - box.min.y;
    ok(tall >= 1.55 && tall <= 1.9, `his model is ${tall.toFixed(2)} m tall (expected 1.55–1.90 m)`);
    modelInfo = `model ${(bytes.length / 1048576).toFixed(2)} MB, ${skin.clips.length} clips, ${tall.toFixed(2)} m, his day played ${[...seen].join(' ')}`;
  }
}
// Weather (js/weather.js): a seeded forecast, a blend of a few seconds, and a wet road in the rain.
const { STATES, forecastAt, createWeather, startWeather } = await import(new URL('js/weather.js', root).href);
ok(STATES.join(',') === 'clear,clouds,rain,storm,fog,wind,snow', `weather states are ${STATES.join(',')}`);
const wx = cfg.weather || {};
const castA = forecastAt('2026-10-19', 8 * 60, wx.forecast);
const castB = forecastAt('2026-10-19', 8 * 60, wx.forecast);
ok(castA.state === castB.state && castA.intensity === castB.intensity, 'the forecast changed for the same date and minute');
let forecastDiffers = false;
for (let d = 1; d <= 27 && !forecastDiffers; d++) {
  for (let slot = 0; slot < 8; slot++) {
    const m = slot * 180 + 20;
    if (forecastAt('2026-10-19', m, wx.forecast).state !== forecastAt(`2026-11-${String(d).padStart(2, '0')}`, m, wx.forecast).state) forecastDiffers = true;
  }
}
ok(forecastDiffers, 'every date drew the same weather');
const sim = createWeather({ blend: wx.blend || 3.4, forecast: wx.forecast });
sim.set('clear', 1, 'key');
sim.step(1, true);
ok(sim.now().wet < 0.05 && sim.now().blend > 0.99, `clear didn't settle (wet ${sim.now().wet}, blend ${sim.now().blend})`);
sim.set('rain', 1, 'key');
sim.step(0.08, false);
ok(sim.now().state === 'rain' && sim.now().blend < 0.25 && sim.now().wet < 0.35, `rain popped in (blend ${sim.now().blend.toFixed(2)}, wet ${sim.now().wet.toFixed(2)})`);
sim.step(1.12, false);
ok(sim.now().blend > 0.4 && sim.now().blend < 0.85, `the blend at 1.2s is ${sim.now().blend.toFixed(2)}, not part-way`);
sim.step(4, false);
ok(sim.now().blend > 0.9 && sim.now().wet > 0.85 && sim.now().sound.rain > 0.5, `rain didn't settle wet (blend ${sim.now().blend.toFixed(2)}, wet ${sim.now().wet.toFixed(2)})`);
sim.set('clear', 1, 'key');
sim.step(0.08, false);
ok(sim.now().wet > 0.55, `clear snapped the wet road off (wet ${sim.now().wet.toFixed(2)})`);
sim.step(5, false);
ok(sim.now().wet < 0.08 && sim.now().shown === 'clear', `clear didn't dry the road (wet ${sim.now().wet.toFixed(2)}, showing ${sim.now().shown})`);
const snapWeather = (state) => {
  sim.set(state, 1, 'key');
  sim.step(1, true);
  return sim.now();
};
const stormW = snapWeather('storm');
const fogW = snapWeather('fog');
const windW = snapWeather('wind');
const snowW = snapWeather('snow');
const cloudsW = snapWeather('clouds');
const clearW = snapWeather('clear');
const rainW = snapWeather('rain');
ok(stormW.wet > 0.8 && stormW.lightning > 0.5 && stormW.sound.thunder > 0.5 && stormW.wind > 0.8, 'a storm is not wet, loud and windy');
ok(fogW.fog > stormW.fog && fogW.wet < 0.25 && fogW.sound.hush > 0.5, 'fog is not the thick muffled one');
ok(windW.wind > 0.8 && windW.rain === 0 && windW.dust > 0.8 && windW.sound.wind > stormW.sound.wind * 0.9, 'wind is not its own blow');
ok(snowW.snow > 0.8 && snowW.rain === 0 && snowW.sound.snow > 0.5, 'snow is not its own fall');
ok(cloudsW.light < 0.7 && cloudsW.wet < 0.1 && cloudsW.light < clearW.light, 'clouds do not dim the day');
const soundSigs = new Set([stormW, fogW, windW, snowW, cloudsW, clearW, rainW].map((s) => JSON.stringify(s.sound)));
ok(soundSigs.size === 7, `two states share a sound (${soundSigs.size} distinct)`);
let backMinute = 0;
let backCast = forecastAt('2026-10-19', 0, wx.forecast);
for (let m = 0; m < 1440 && backCast.state === 'snow'; m += 30) {
  backMinute = m;
  backCast = forecastAt('2026-10-19', m, wx.forecast);
}
sim.set('snow', 1, 'key');
sim.step(1, true);
sim.follow('2026-10-19', backMinute, 0.05, false, 'control');
ok(sim.now().manual && sim.now().state === 'snow', 'taking control handed the weather back to the day');
sim.follow('2026-10-19', backMinute, 0.05, false, 'schedule');
ok(sim.now().manual && sim.now().state === 'snow' && sim.now().hold > 0, `letting go dropped the weather immediately (manual ${sim.now().manual}, hold ${sim.now().hold})`);
ok(sim.now().shown === 'snow', 'the held weather should still show snow right after let-go');
const holdSec = sim.holdSec || (wx.hold || 24);
// Almost the full hold: still manual and still looking like snow
for (let i = 0; i < 20; i++) sim.follow('2026-10-19', backMinute, (holdSec * 0.85) / 20, false, 'schedule');
ok(sim.now().manual && sim.now().state === 'snow' && sim.now().shown === 'snow', `hold ended early (manual ${sim.now().manual}, shown ${sim.now().shown}, hold ${sim.now().hold.toFixed(1)})`);
// Finish the hold and let it drift
for (let i = 0; i < 40 && sim.now().manual; i++) sim.follow('2026-10-19', backMinute, 0.5, false, 'schedule');
ok(!sim.now().manual && sim.now().state === backCast.state, `after the hold it stayed on ${sim.now().state} instead of the day's ${backCast.state}`);
if (backCast.state !== 'snow') {
  const mid = sim.now();
  ok(mid.shown === 'snow' || mid.blend < 0.85, `drifting back popped straight to the forecast (shown ${mid.shown}, blend ${mid.blend.toFixed(2)})`);
}
const weatherLines = wx.lines || {};
ok(STATES.every((s) => weatherLines[s]), 'day.config.js weather.lines is missing a state');
ok(!Object.values(weatherLines).some((t) => /\b(they|their|theirs|themselves)\b/i.test(t)), `weather lines that say "they": ${Object.values(weatherLines).join(' | ')}`);
const mounted = startWeather(world, {
  now: () => ({ key: '2026-10-19', minutes: 600 }),
  note() {},
});
ok(mounted && mounted.now, "weather didn't attach to the world");
const frW = E.frame(day, day.dayStart + 60);
world.update(frW, 0.05, {});
mounted.set('rain', 1, 'test');
world.update(frW, 0.05, {});
ok(mounted.now().state === 'rain' && mounted.now().blend < 0.55, `the world jumped to rain (blend ${mounted.now().blend.toFixed(2)})`);
world.update(frW, 0.05, { snap: true });
const wetRoad = mounted.now();
ok(wetRoad.blend > 0.9 && wetRoad.wet > 0.8 && wetRoad.gloss > 0.35 && wetRoad.puddles > 0, `rain didn't wet the road (wet ${wetRoad.wet.toFixed(2)}, gloss ${wetRoad.gloss == null ? '?' : wetRoad.gloss.toFixed(2)}, puddles ${wetRoad.puddles})`);
mounted.set('clear', 1, 'test');
world.update(frW, 0.05, { snap: true });
ok(mounted.now().wet < 0.12 && mounted.now().gloss < 0.2, `clear left the road wet (gloss ${mounted.now().gloss.toFixed(2)})`);
ok(!world.scene.textures.some((t) => t.getClassName && t.getClassName() === 'MirrorTexture'), 'MirrorTexture still exists in scene.textures');

// Standing at an avenue intersection without pressing jump must not lift him off the ground.
mover.start(0, 12.6, 0);
mover.setUpdrafts([{ x: 0, z: 12.6, r: 4.5, lift: 8, kind: 'ambient' }]);
for (let i = 0; i < 60; i++) {
  mover.step(DT, { x: 0, z: 0, jump: 0, hold: false });
  physicsStep();
}
ok(ms.grounded && ms.y < 0.15, `standing in an updraft without holding jump lifted him to y=${ms.y.toFixed(2)}`);

const lines = (cfg.control && cfg.control.lines) || {};
const controlTexts = Object.values(lines).flat();
ok(['take', 'letGo', 'back', 'steering'].every((k) => lines[k]), 'day.config.js control.lines needs take, steering, letGo and back');
ok(!controlTexts.some((t) => /\b(they|their|theirs|themselves)\b/i.test(t)), `control lines that say "they" for him: ${controlTexts.join(' | ')}`);

// Performance & root-cause monitor checks (hawkesPerf): steady-state frame time, 0 dirty calls/sec, shadow proxy, no GlowLayer, frozen static meshes.
const { installHawkesPerf } = await import(new URL('js/hawkes-perf.js', root).href);
const perf = installHawkesPerf(world.scene, { product: 'icanbe' });
for (let i = 0; i < 4; i++) {
  world.update(E.frame(day, 9 * 60 + i * 0.01), DT);
  world.scene.render();
}
perf.resetCounters();
const perfT0 = performance.now();
for (let i = 0; i < 30; i++) {
  world.update(E.frame(day, 9 * 60 + 0.05 + i * 0.01), DT);
  world.scene.render();
}
const avgFrameMs = (performance.now() - perfT0) / 30;
const snap = perf.snapshot();
ok(snap && snap.geometry && snap.batching && snap.timing, 'hawkesPerf.snapshot() did not return expected sections');
ok(snap.batching.materialDirtyCallsPerSec === 0, `steady-state materialDirtyCallsPerSec is ${snap.batching.materialDirtyCallsPerSec} (expected 0)`);
ok(snap.geometry.shadowTris > 0 && snap.geometry.shadowTris < 25000, `shadowTris is ${snap.geometry.shadowTris} (expected < 25000 with shadow proxy)`);
ok((world.scene.effectLayers || []).length === 0, `scene still has ${(world.scene.effectLayers || []).length} effectLayer(s) (GlowLayer should be removed)`);
ok(snap.batching.frozenMeshes >= 400, `only ${snap.batching.frozenMeshes} static meshes are frozen`);
ok(avgFrameMs < 15, `average NullEngine frame time is ${avgFrameMs.toFixed(2)} ms (expected < 15 ms)`);

const summary = `Babylon ${core.Engine.Version}, Havok: ${p.colliders} colliders in ${p.bodies} bodies; ${day.actions.length} actions; field ${g && g.y.toFixed(2)}, road ${r && r.y.toFixed(2)}, home floor ${inside && inside.y.toFixed(2)}, bed ${onBed && onBed.y.toFixed(2)}, capsule at ${cap.position.y.toFixed(2)}; control: walk ${walked.toFixed(2)} m/s, three jumps ${(peak - y0).toFixed(2)} m, walked back in ${(steps / 60).toFixed(1)} s; ${modelInfo}; perf: ${avgFrameMs.toFixed(2)} ms/frame, ${snap.geometry.shadowTris} shadow tris, ${snap.batching.frozenMeshes} frozen meshes`;
if (problems.length) {
  console.error(`check-world: ${problems.length} problem(s)\n- ${problems.join('\n- ')}\n${summary}`);
  process.exit(1);
}
console.log(`check-world: ok. ${summary}`);
process.exit(0);
