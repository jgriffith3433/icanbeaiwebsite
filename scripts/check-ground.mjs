// Feet on the ground: props, people and Small Weather himself stand on what's under them, and he walks down a ramp
// instead of hopping and falling down it. Runs the world under Babylon's NullEngine with Havok (no page, no GPU).
//   node scripts/check-ground.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';

const root = new URL('../', import.meta.url);
const require = createRequire(new URL('package.json', root));
const core = await import(require.resolve('@babylonjs/core'));
const HavokPhysics = (await import(require.resolve('@babylonjs/havok'))).default;

class Engine extends core.NullEngine {
  constructor() {
    super({ renderHeight: 360, renderWidth: 640, textureSize: 256, deterministicLockstep: false, lockstepMaxSteps: 1 });
    this.getCaps().instancedArrays = true; // keep thin instances (the crowd, the lamp posts)
  }
}
const BABYLON = { ...core, Engine };
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => ((t[k] = v), true) });
const document = { createElement: () => ({ getContext: () => ctx2d, width: 0, height: 0, style: {} }) };
const events = { addEventListener() {}, removeEventListener() {} };
Object.assign(globalThis, { window: globalThis, BABYLON, document, devicePixelRatio: 1, ...events });
for (const f of ['day.config.js', 'js/schedule.js', 'js/world.js']) await import(new URL(f, root).href);

let failed = 0;
const ok = (cond, msg) => {
  if (!cond) {
    failed++;
    console.error('FAIL', msg);
  }
};

const cfg = globalThis.DAY_CONFIG;
const E = globalThis.DayEngine;
const day = E.build(cfg, '2026-10-19');
const world = globalThis.DayWorld.create({ ...events, removeAttribute() {}, setAttribute() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }) }, cfg, day.spots, day.rooms);
const { installLook } = await import(new URL('js/look.js', root).href);
installLook(world);
const { installCityscape } = await import(new URL('js/cityscape.js', root).href);
installCityscape(world);
world.update(E.frame(day, 12 * 60), 0.016, { snap: true });
world.scene.render();

// Before physics: surfaceAt is the only ground there is, and it has to know the sidewalk, the road and the floors.
const street = cfg.street;
const RZ = street.z;
const near = (a, b, d = 0.01) => a != null && b != null && Math.abs(a - b) <= d;
ok(near(world.surfaceAt(street.from + 30, RZ + 2.6), 0.06), `surfaceAt on the sidewalk is ${world.surfaceAt(street.from + 30, RZ + 2.6)}, not 0.06`);
ok(near(world.surfaceAt(street.from + 30, RZ), 0.04), `surfaceAt on the road is ${world.surfaceAt(street.from + 30, RZ)}, not 0.04`);

const wasmBinary = fs.readFileSync(require.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm'));
world.enablePhysics(await HavokPhysics({ wasmBinary }));
world.scene.render();
const pe = world.scene.getPhysicsEngine();
const gy = (x, z, from = 3) => {
  const h = world.groundAt(x, z, from);
  return h ? h.y : null;
};

// 1. surfaceAt (used by the neighbours, the finale's crowd and the stalls) agrees with the colliders.
const home = cfg.buildings.home;
const ho = home.origin || [0, 0];
const plaza = cfg.city && cfg.city.plaza;
const park = cfg.city && cfg.city.park;
const spots = [
  ['the open field', street.from + 30, RZ + 40],
  ['the road', street.from + 30, RZ],
  ['the sidewalk', street.from + 30, RZ + 2.6],
  ['the home floor', (home.bounds[0] + home.bounds[2]) / 2 + ho[0], (home.bounds[1] + home.bounds[3]) / 2 + ho[1], 0.5],
];
if (plaza) spots.push(['the plaza', (plaza.x0 + plaza.x1) / 2 + 3, (plaza.z0 + plaza.z1) / 2 + 3]);
if (park) spots.push(['the park lawn', (park.x0 + park.x1) / 2 + 3, (park.z0 + park.z1) / 2 + 3]);
spots.forEach(([label, x, z, from]) => {
  const s = world.surfaceAt(x, z);
  const g = gy(x, z, from == null ? 0.5 : from);
  ok(near(s, g, 0.012), `surfaceAt on ${label} is ${s}, the colliders say ${g}`);
});

// 2. The merged street furniture (benches, bins, trees, bus stops, lamps, stalls) rests on the ground: no bottom vertex
//    more than 3 cm under it or over it.
for (const name of ['props-solid', 'props-glow']) {
  const m = world.scene.getMeshByName(name);
  if (!m) continue;
  const pos = m.getVerticesData(core.VertexBuffer.PositionKind);
  // the lowest vertex in each half-metre cell is a thing's foot there (the tops of low slabs aren't)
  const low = new Map();
  for (let i = 0; i < pos.length; i += 3) {
    const y = pos[i + 1];
    if (y > 0.2) continue;
    const k = `${Math.round(pos[i] * 2)},${Math.round(pos[i + 2] * 2)}`;
    const cur = low.get(k);
    if (!cur || y < cur[1]) low.set(k, [pos[i], y, pos[i + 2]]);
  }
  const off = new Map();
  low.forEach(([x, y, z]) => {
    const g = gy(x, z, y + 0.25);
    // a foot sunk in, or one 3 to 12 cm up (higher than that it's the underside of something, like a bench seat)
    if (g == null || Math.abs(y - g) <= 0.03 || y - g > 0.12) return;
    const k = `${Math.round(x)},${Math.round(z)}`;
    if (!off.has(k)) off.set(k, (y - g).toFixed(3));
  });
  ok(off.size <= 2, `${name}: things off the ground by more than 3 cm at ${off.size} spots (${[...off.entries()].slice(0, 6).map(([k, v]) => k + ' ' + v).join(', ')})`);
}

// 2b. A TV sits on its stand or dresser, not in the air beside the window (the black slab in the bedroom frames).
for (const [tv, base] of [['tv', 'tvstand'], ['btv', 'dresser']]) {
  const t = world.scene.getMeshByName(tv);
  const b = world.scene.getMeshByName(base);
  t.computeWorldMatrix(true);
  b.computeWorldMatrix(true);
  const gap = t.getBoundingInfo().boundingBox.minimumWorld.y - b.getBoundingInfo().boundingBox.maximumWorld.y;
  ok(Math.abs(gap) <= 0.01, `${tv} is ${gap.toFixed(3)} m off its ${base}`);
}

// 3. The district's people walk the sidewalks and the crossings, never the grass beside them.
const { installCrowd } = await import(new URL('js/crowd.js', root).href);
globalThis.day = { now: () => ({ minutes: 12.5 * 60, mode: 'play' }), world: () => world, control: { mode: () => 'schedule', state: () => ({}) } };
const crowd = installCrowd(world);
for (let i = 0; i < 300; i++) crowd.step(1 / 30);
const walkers = crowd.positions().people.filter((p) => p.state === 'walk' || p.state === 'wait');
const onGrass = walkers.filter((p) => world.surfaceAt(p.x, p.z) < 0.035);
ok(walkers.length > 10, `only ${walkers.length} people walking at noon`);
ok(onGrass.length === 0, `${onGrass.length} of ${walkers.length} walking people are off the sidewalk (e.g. ${onGrass.slice(0, 3).map((p) => p.x.toFixed(1) + ',' + p.z.toFixed(1)).join(' ')})`);

// 4. His day: standing or walking, his feet are on the floor under him, indoors and out.
const FOOT = 0.91; // the stand and walk poses' height above a room's floor (1.01 - 0.1)
const wrong = [];
let outside = 0;
for (let min = 0; min < 24 * 60; min += 0.25) {
  const fr = E.frame(day, min);
  const p = fr.person;
  world.update(fr, 0.016, { snap: true });
  if (!p || p.inCar || (p.pose !== 'stand' && p.pose !== 'walk')) continue;
  const g = gy(p.x, p.z, 0.5);
  if (g == null || g > 0.4) continue;
  const room = E.roomAt(day.rooms, p.x, p.z);
  if (room == null || room === 'lot' || room === 'yard') outside++;
  const y = world.person.position.y;
  if (!near(y, FOOT + g, 0.012)) wrong.push(`${Math.floor(min / 60)}:${String(Math.floor(min % 60)).padStart(2, '0')} y ${y.toFixed(3)} ground ${g.toFixed(3)}`);
}
ok(outside > 3, `his day was outdoors on foot at only ${outside} sampled moments, the check needs more`);
ok(wrong.length === 0, `his feet aren't on the ground at ${wrong.length} moments: ${wrong.slice(0, 4).join('; ')}`);

// 5. Taking control: walking or running down every rooftop ramp keeps him on it, walking or running, never falling.
const { createMover } = await import(new URL('js/control.js', root).href);
const mover = createMover(world, cfg);
const ms = mover.state;
const DT = 1 / 60;
const run = (n, input) => {
  const anims = [];
  for (let i = 0; i < n; i++) {
    mover.step(DT, i === 0 ? input : { ...input, jump: 0 });
    pe._step(DT);
    anims.push(ms.anim + (ms.grounded ? '' : '*'));
  }
  return anims;
};
const ramps = (cfg.city.blocks || []).filter((b) => b.stair);
ok(ramps.length > 0, 'no rooftop ramps to walk down');
for (const b of ramps) {
  const s = b.stair;
  for (const sprint of [false, true]) {
    // up the ramp from its foot to the roof, then turn round and come down
    mover.start(s.x0 - 0.9, s.z, Math.PI / 2);
    run(20, { x: 0, z: 0 });
    for (let i = 0; i < 600 && ms.x < s.x1 - 0.3; i++) {
      mover.step(DT, { x: 1, z: 0 });
      pe._step(DT);
    }
    run(30, { x: 0, z: 0 });
    const y0 = ms.y;
    const anims = run(Math.round(60 * (sprint ? 2.5 : 5)), { x: -1, z: 0, sprint });
    const bad = anims.filter((a) => /fall|jump|float/.test(a)).length;
    const air = anims.filter((a) => a.endsWith('*')).length;
    ok(ms.y < y0 - 1, `${b.id} ramp ${sprint ? 'run' : 'walk'}: he didn't get down (y ${y0.toFixed(2)} to ${ms.y.toFixed(2)})`);
    ok(bad === 0, `${b.id} ramp ${sprint ? 'run' : 'walk'}: ${bad} frames of falling or jumping on the way down`);
    ok(air <= anims.length * 0.1, `${b.id} ramp ${sprint ? 'run' : 'walk'}: off the ramp for ${air} of ${anims.length} frames`);
  }
}

if (failed) {
  console.error(`check-ground: ${failed} failed`);
  process.exit(1);
}
console.log('check-ground: ok');
process.exit(0);
