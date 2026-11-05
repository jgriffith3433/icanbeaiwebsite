// The city's crowd (js/crowd.js) without a browser: the hour sets how many people and cars are out (busy at
// rush hour and lunch, quiet at night), they move, they stay on the sidewalks and lanes, cars stop for red,
// quality low thins them, and the sim stays cheap.
//
//   node scripts/check-crowd.mjs
//
import * as core from '@babylonjs/core';

const problems = [];
const ok = (cond, msg) => {
  if (!cond) problems.push(msg);
  return cond;
};

class Engine extends core.NullEngine {
  constructor() {
    super({ renderHeight: 360, renderWidth: 640, textureSize: 256, deterministicLockstep: false, lockstepMaxSteps: 1 });
  }
}
const BABYLON = { ...core, Engine };
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => ((t[k] = v), true) });
const document = { createElement: () => ({ getContext: () => ctx2d, width: 0, height: 0, style: {} }) };
const events = { addEventListener() {}, removeEventListener() {} };
const root = new URL('../', import.meta.url);
Object.assign(globalThis, { window: globalThis, BABYLON, document, devicePixelRatio: 1, ...events });
for (const f of ['day.config.js', 'js/schedule.js', 'js/world.js']) await import(new URL(f, root).href);
core.Logger.LogLevels = core.Logger.NoneLogLevel; // NullEngine can't instance; the sim still runs
const { densityAt, signalAt, installCrowd } = await import(new URL('js/crowd.js', root).href);
const cfg = globalThis.DAY_CONFIG;
const day = globalThis.DayEngine.build(cfg, '2026-10-19');
const world = globalThis.DayWorld.create({ ...events, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }) }, cfg, day.spots, day.rooms);

// the curve alone: rush hour and lunch are busy, night is quiet, midnight wraps
const curve = cfg.crowd.curve;
const at = (h) => densityAt(curve, h);
ok(at(8.5).cars >= 0.95, `rush hour cars ${at(8.5).cars}`);
ok(at(18).cars >= 0.95, `evening rush cars ${at(18).cars}`);
ok(at(12.5).people >= 0.9, `lunch people ${at(12.5).people}`);
ok(at(19.5).people >= 0.85, `dinner people ${at(19.5).people}`);
ok(at(2).people <= 0.05 && at(2).cars <= 0.06, `night is not quiet: ${JSON.stringify(at(2))}`);
ok(Math.abs(at(0).people - at(24).people) < 1e-9, 'the curve does not wrap at midnight');
ok(at(8.5).cars > at(14.5).cars && at(12.5).people > at(10.5).people, 'rush hour/lunch are not peaks');
ok(signalAt(0, 0).avenue === 'go' && signalAt(20, 0).cross === 'go' && signalAt(20, 0).avenue === 'stop', 'the signal does not alternate');
ok(['go', 'amber', 'stop'].every((k) => [0, 15, 17, 25, 33, 35].some((t) => Object.values(signalAt(t, 0)).includes(k))), 'the signal misses a phase');

const { installLook } = await import(new URL('js/look.js', root).href);
installLook(world);
const { installCityscape } = await import(new URL('js/cityscape.js', root).href);
installCityscape(world);

let minutes = 3 * 60;
let mode = 'play';
globalThis.day = { now: () => ({ minutes, mode }), world: () => world, control: { mode: () => 'schedule', state: () => ({}) } };
const crowd = installCrowd(world);
ok(crowd && world.crowd === crowd && globalThis.day.crowd === crowd, 'the crowd is not on world.crowd / day.crowd');
const i0 = crowd.info();
ok(i0.junctions >= 8, `only ${i0.junctions} junctions`);
ok(i0.doors >= 40, `only ${i0.doors} doors to go in and out of`);
ok(i0.lanes >= 10, `only ${i0.lanes} car lanes`);

const run = (secs) => { for (let t = 0; t < secs; t += 1 / 30) crowd.step(1 / 30); };
function settle(h) {
  minutes = h * 60;
  crowd.step(1 / 30); // a jump re-seeds the city for the hour
  run(8);
  return crowd.info();
}

const night = settle(3);
const rush = settle(8.5);
const lunch = settle(12.5);
const dinner = settle(19.5);
const late = settle(23.5);
console.log('crowd night', night.people, night.cars, 'rush', rush.people, rush.cars, 'lunch', lunch.people, lunch.cars, 'dinner', dinner.people, dinner.cars, 'late', late.people, late.cars);
ok(night.people <= 12 && night.cars <= 6, `night is busy: ${night.people} people, ${night.cars} cars`);
ok(rush.cars >= 40 && rush.people >= 150, `rush hour is thin: ${rush.people} people, ${rush.cars} cars`);
ok(lunch.people >= 200, `lunch is thin: ${lunch.people} people`);
ok(dinner.people >= 180, `dinner is thin: ${dinner.people} people`);
ok(rush.cars > night.cars * 6 && rush.people > night.people * 10, 'rush hour is not much busier than night');
ok(late.people < dinner.people * 0.4, `late evening is not quieter than dinner (${late.people} vs ${dinner.people})`);
ok(rush.phase === 'morning commute' && night.phase === 'night' && lunch.phase === 'lunch' && dinner.phase === 'dinner', `phases: ${[night, rush, lunch, dinner].map((i) => i.phase).join(', ')}`);

// they move, and stay where people and cars belong
const before = crowd.positions();
run(3);
const after = crowd.positions();
const mover = settle(12.5);
ok(mover.moving > 0.5, `only ${(mover.moving * 100).toFixed(0)}% of the people moved`);
let offGrid = 0;
const avZ = [cfg.street.z, ...cfg.city.avenues.map((a) => a.z)];
const crX = cfg.city.crosses.map((c) => c.x);
crowd.positions().people.forEach((p) => {
  const onAv = avZ.some((z) => Math.abs(Math.abs(p.z - z) - 3.5) < 0.3) || (p.state !== 'door-in' && p.state !== 'door-out' ? false : true);
  const onCr = crX.some((x) => Math.abs(Math.abs(p.x - x) - 3.5) < 0.3);
  const crossing = avZ.some((z) => Math.abs(p.z - z) < 3.6) && crX.some((x) => Math.abs(Math.abs(p.x - x) - 3.5) < 0.3);
  const crossing2 = crX.some((x) => Math.abs(p.x - x) < 3.6) && avZ.some((z) => Math.abs(Math.abs(p.z - z) - 3.5) < 0.3);
  if (!(onAv || onCr || crossing || crossing2)) offGrid++;
});
ok(offGrid === 0, `${offGrid} people are off the sidewalks and crosswalks`);
ok(before.people.length > 0 && after.people.length > 0, 'nobody on the street at noon');
let carsOff = 0;
crowd.positions().cars.forEach((c) => {
  const laneZ = avZ.some((z) => Math.abs(Math.abs(c.z - z) - 1.2) < 0.05);
  const laneX = crX.some((x) => Math.abs(Math.abs(c.x - x) - 1.2) < 0.05);
  if (!laneZ && !laneX) carsOff++;
});
ok(carsOff === 0, `${carsOff} cars are off their lanes`);
// no two cars overlap
const cs = crowd.positions().cars;
let overlaps = 0;
for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) if (Math.hypot(cs[i].x - cs[j].x, cs[i].z - cs[j].z) < 2.4) overlaps++;
ok(overlaps <= 2, `${overlaps} cars sit on top of each other`);
ok(mover.stopped >= 0 && mover.cars > 0, 'no cars at lunch');

// people go in and come out of buildings: over a minute of lunch, some doors are used
run(40);
const seen = { in: 0, out: 0 };
for (let t = 0; t < 60 * 30; t++) {
  crowd.step(1 / 30);
  if (t % 15 === 0) { const i = crowd.info(); seen.in += i.leaving; seen.out += i.entering; }
}
ok(seen.in > 0 && seen.out > 0, `nobody went in or out of a building in a minute (in ${seen.in}, out ${seen.out})`);
const lunchNow = crowd.info();
ok(lunchNow.crossing + lunchNow.waiting > 0, 'nobody crosses at the crosswalks');

// cars stop at red: somewhere in half a minute at rush hour a car is stopped at a light
settle(8.5);
let stopped = 0;
for (let t = 0; t < 60 * 30; t++) { crowd.step(1 / 30); if (t % 30 === 0) stopped = Math.max(stopped, crowd.info().stopped); }
ok(stopped > 0, 'no car ever stops at a red light at rush hour');
ok(Math.max(...crowd.positions().cars.map((c) => c.v)) > 6, 'cars never get up to speed');

// pause freezes it
mode = 'pause';
const p1 = JSON.stringify(crowd.positions());
run(2);
ok(JSON.stringify(crowd.positions()) === p1, 'the crowd moves while the day is paused');
mode = 'play';

// quality low thins it
world.look.quality('low');
const low = settle(12.5);
ok(low.quality === 'low', `quality is ${low.quality}`);
{
  ok(low.people <= 130 && low.cars <= 30, `quality low keeps ${low.people} people and ${low.cars} cars`);
  ok(low.people < lunch.people * 0.6, 'quality low did not thin the crowd');
  world.look.quality('high');
}

// the sim itself is cheap
const t0 = performance.now();
settle(8.5);
for (let i = 0; i < 300; i++) crowd.step(1 / 60);
const ms = (performance.now() - t0) / 300;
console.log('crowd step ms', ms.toFixed(3));
ok(ms < 4, `a crowd frame costs ${ms.toFixed(2)} ms of script`);

if (problems.length) {
  console.error('crowd check failed:\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log('crowd ok');
process.exit(0);
