// Builds the day and the 3D world without a browser (Babylon's NullEngine) and turns Havok physics on, the way the
// page does, then checks what the page relies on: Babylon 9, the day compiles without errors, the colliders exist and
// stand where the world is (ground, a building floor, a wall, a house), and the person is Small Weather.
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
world.update(sandbox.DayEngine.frame(day, day.dayStart + 1), 0.016, { snap: true });

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

const summary = `Babylon ${core.Engine.Version}, Havok: ${p.colliders} colliders in ${p.bodies} bodies; ${day.actions.length} actions; field ${g && g.y.toFixed(2)}, road ${r && r.y.toFixed(2)}, home floor ${inside && inside.y.toFixed(2)}, bed ${onBed && onBed.y.toFixed(2)}, capsule at ${cap.position.y.toFixed(2)}`;
if (problems.length) {
  console.error(`check-world: ${problems.length} problem(s)\n- ${problems.join('\n- ')}\n${summary}`);
  process.exit(1);
}
console.log(`check-world: ok. ${summary}`);
process.exit(0);
